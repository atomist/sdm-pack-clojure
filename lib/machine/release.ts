/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// tslint:disable:max-file-line-count

import {
    configurationValue,
    GitProject,
    logger,
    Success,
} from "@atomist/automation-client";
import {
    DelimitedWriteProgressLogDecorator,
    ExecuteGoal,
    ExecuteGoalResult,
    GoalInvocation,
    PrepareForGoalExecution,
    ProgressLog,
    ProjectLoader,
    SpawnLogOptions,
    spawnLog,
} from "@atomist/sdm";
import { readSdmVersion } from "@atomist/sdm-core";
import { DockerOptions } from "@atomist/sdm-pack-docker";

interface ProjectRegistryInfo {
    registry: string;
    name: string;
    version: string;
}

export async function rwlcVersion(gi: GoalInvocation): Promise<string> {
    const sdmGoal = gi.goalEvent;
    const version = await readSdmVersion(
        sdmGoal.repo.owner,
        sdmGoal.repo.name,
        sdmGoal.repo.providerId,
        sdmGoal.sha,
        sdmGoal.branch,
        gi.context);
    return version;
}

function releaseVersion(version: string): string {
    return version.replace(/-.*/, "");
}

function dockerImage(p: ProjectRegistryInfo): string {
    return `${p.registry}/${p.name}:${p.version}`;
}

type ExecuteLogger = (l: ProgressLog) => Promise<ExecuteGoalResult>;

interface SpawnWatchCommand {
    cmd: {
        command: string,
        args: string[],
    };
    cwd?: string;
}

/**
 * Transform a SpawnWatchCommand into an ExecuteLogger suitable for
 * execution by executeLoggers.  The operation is awaited and any
 * thrown exceptions are caught and transformed into an error result.
 * If an error occurs, it is logged.  The result of the operation is
 * transformed into a ExecuteGoalResult.  If an exception is caught,
 * the returned code is guaranteed to be non-zero.
 */
function spawnExecuteLogger(swc: SpawnWatchCommand): ExecuteLogger {

    return async (log: ProgressLog) => {

        const opts: SpawnLogOptions = {log};

        if (swc.cwd) {
            opts.cwd = swc.cwd;
        }

        const res = await spawnLog(swc.cmd.command, swc.cmd.args, opts);

        if (res.error) {
            if (!res.message) {
                res.message = `Spawned command failed (status:${res.code}): ${swc.cmd.command} ${swc.cmd.args.join(" ")}`;
            }
            logger.error(res.message);
            log.write(res.message);
        }

        return res;
    };
}

/**
 * Execute an array of logged commands, creating a line-delimited
 * progress log beforehand, flushing after each command, and closing
 * it at the end.  If any command fails, bail out and return the
 * failure result.  Otherwise return Success.
 */
async function executeLoggers(els: ExecuteLogger[], progressLog: ProgressLog): Promise<ExecuteGoalResult> {
    const log = new DelimitedWriteProgressLogDecorator(progressLog, "\n");
    for (const cmd of els) {
        const res = await cmd(log);
        await log.flush();
        if (res.code !== 0) {
            await log.close();
            return res;
        }
    }
    await log.close();
    return Success;
}

export async function dockerReleasePreparation(p: GitProject, rwlc: GoalInvocation): Promise<ExecuteGoalResult> {
    const version = await rwlcVersion(rwlc);
    const dockerOptions = configurationValue<DockerOptions>("sdm.docker.hub");
    const image = dockerImage({
        registry: dockerOptions.registry,
        name: p.name,
        version,
    });

    const cmds: SpawnWatchCommand[] = [
        {
            cmd: {
                command: "docker",
                args: ["login", "--username", dockerOptions.user, "--password", dockerOptions.password],
            },
        },
        {
            cmd: { command: "docker", args: ["pull", image] },
        },
    ];
    const els = cmds.map(spawnExecuteLogger);
    return executeLoggers(els, rwlc.progressLog);
}

export const DockerReleasePreparations: PrepareForGoalExecution[] = [dockerReleasePreparation];

export function executeReleaseDocker(
    projectLoader: ProjectLoader,
    preparations: PrepareForGoalExecution[] = DockerReleasePreparations,
    options?: DockerOptions,
): ExecuteGoal {

    return async (rwlc: GoalInvocation) => {
        const { credentials, id, context } = rwlc;
        if (!options.registry) {
            throw new Error(`No registry defined in Docker options`);
        }
        return projectLoader.doWithProject({ credentials, id, context, readOnly: false }, async (project: GitProject) => {

            for (const preparation of preparations) {
                const pResult = await preparation(project, rwlc);
                if (pResult && pResult.code !== 0) {
                    return pResult;
                }
            }

            const version = await rwlcVersion(rwlc);
            const versionRelease = releaseVersion(version);
            const image = dockerImage({
                registry: options.registry,
                name: rwlc.id.repo,
                version,
            });
            const tag = dockerImage({
                registry: options.registry,
                name: rwlc.id.repo,
                version: versionRelease,
            });

            const cmds: SpawnWatchCommand[] = [
                {
                    cmd: { command: "docker", args: ["tag", image, tag] },
                },
                {
                    cmd: { command: "docker", args: ["push", tag] },
                },
                {
                    cmd: { command: "docker", args: ["rmi", tag] },
                },
            ];
            const els = cmds.map(spawnExecuteLogger);
            return executeLoggers(els, rwlc.progressLog);
        });
    };
}
