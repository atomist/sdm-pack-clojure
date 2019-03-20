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

import {
    asSpawnCommand,
    GitHubRepoRef,
    GitProject,
    HandlerContext,
    logger,
    spawnAndWatch,
} from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import {
    allSatisfied,
    execPromise,
    ExecPromiseResult,
    ExecuteGoal,
    ExecuteGoalResult,
    ExtensionPack,
    GoalInvocation,
    GoalProjectListenerEvent,
    GoalProjectListenerRegistration,
    hasFile,
    LoggingProgressLog,
    LogSuppressor,
    metadata,
    not,
    SdmGoalEvent,
    spawnLog,
    ToDefaultBranch,
} from "@atomist/sdm";
import {
    ProjectVersioner,
    readSdmVersion,
} from "@atomist/sdm-core";
import { spawnBuilder } from "@atomist/sdm-pack-build";
import {
    DockerImageNameCreator,
    DockerOptions,
} from "@atomist/sdm-pack-docker";
import { HasTravisFile } from "@atomist/sdm/lib/api-helper/pushtest/ci/ciPushTests";
import { SpawnOptions } from "child_process";
import * as df from "dateformat";
import * as fs from "fs";
import * as _ from "lodash";
import * as path from "path";
import {
    HasLeinPlugin,
    IsLein,
} from "../support/pushTest";
import {
    autofix,
    checkDependencies,
    confusingVersions,
    dockerBuild,
    leinBuild,
    publish,
    version,
} from "./goals";
import { rwlcVersion } from "./release";

export const imageNamer: DockerImageNameCreator =
    async (p: GitProject,
           sdmGoal: SdmGoalEvent,
           options: DockerOptions,
           ctx: HandlerContext) => {
        const projectclj = path.join(p.baseDir, "project.clj");
        const newversion = await readSdmVersion(
            sdmGoal.repo.owner,
            sdmGoal.repo.name,
            sdmGoal.repo.providerId,
            sdmGoal.sha,
            sdmGoal.branch,
            ctx);
        const projectName = _.last(clj.getName(projectclj).split("/"));
        logger.info(`Docker Image name is generated from ${projectclj} name and version ${projectName} ${newversion}`);
        return {
            name: projectName,
            registry: options.registry,
            tags: [newversion],
        };
    };

export const LeinSupport: ExtensionPack = {
    ...metadata(),
    configure: sdm => {

        leinBuild.with(
            {
                name: "Lein build",
                builder: LeinBuilder,
                pushTest: IsLein,
            },
        );

        publish.with({
            name: "deploy-jar",
            goalExecutor: LeinDeployer,
            pushTest: IsLein,
        });

        version.with({
            name: "lein-version",
            versioner: LeinProjectVersioner,
            pushTest: IsLein,
        });

        dockerBuild.with({
                name: "lein-docker-build",
                imageNameCreator: imageNamer,
                options: {
                    ...sdm.configuration.sdm.docker.jfrog as DockerOptions,
                    dockerfileFinder: async () => "docker/Dockerfile",
                },
                pushTest: allSatisfied(IsLein, hasFile("docker/Dockerfile")),
            })
            .withProjectListener(Metajar);

        autofix.with({
            name: "cljformat",
            transform: async p => {
                await clj.cljfmt((p as GitProject).baseDir);
                return p;
            },
            pushTest: allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
        });

        checkDependencies.with({
            name: "checkDependencies",
            pushTest: allSatisfied(IsLein),
            goalExecutor: async (rwlc: GoalInvocation): Promise<ExecuteGoalResult> => {

                return rwlc.configuration.sdm.projectLoader.doWithProject(
                    {
                        ...rwlc,
                        readOnly: true,
                    },
                    async (project: GitProject) => {

                        const spawnOptions = await enrich({}, project);

                        return spawnLog(
                            "lein",
                            ["with-profile", "-dev", "dependency-check", "--throw"],
                            {
                                ...spawnOptions,
                                log: new LoggingProgressLog("dependency-check"),
                                cwd: project.baseDir,
                            },
                        );
                    },
                );
            },
        });

        confusingVersions.with({
            name: "confusingVersions",
            pushTest: allSatisfied(IsLein),
            goalExecutor: async (rwlc: GoalInvocation): Promise<ExecuteGoalResult> => {

                return rwlc.configuration.sdm.projectLoader.doWithProject(
                    {
                        ...rwlc,
                        readOnly: true,
                    },
                    async (project: GitProject) => {

                        const spawnOptions = await enrich({}, project);

                        const result: ExecPromiseResult = await execPromise(
                            "lein",
                            ["deps", ":tree"],
                            {
                                ...spawnOptions,
                                cwd: project.baseDir,
                            },
                        );

                        return {
                            code: result.stderr.includes("confusion") ? 1 : 0,
                        };
                    },
                );
            },
        });
    },
};

const LeinDeployer: ExecuteGoal = async (rwlc: GoalInvocation): Promise<ExecuteGoalResult> => {
    const { credentials, id, context, configuration } = rwlc;
    const v = await rwlcVersion(rwlc);

    return configuration.sdm.projectLoader.doWithProject({
            credentials,
            id,
            readOnly: false,
            context,
        },
        async (project: GitProject) => {
            const file = path.join(project.baseDir, "project.clj");
            await clj.setVersion(file, v);
            return spawnAndWatch({
                command: "lein",
                args: [
                    "deploy",
                ],
            }, await enrich({
                cwd: project.baseDir,
                env: process.env,
            }, project), rwlc.progressLog);
        },
    );
};

/**
 * Add stuff from vault to env
 * @param options original options
 * @param project optional project
 */
export async function enrich(options: SpawnOptions = {}, project: GitProject): Promise<SpawnOptions> {
    const key = process.env.TEAM_CRED;
    const vault = path.join(fs.realpathSync(__dirname), "../resources/vault.txt");
    const defaultEncryptedEnv = { env: clj.vault(key, vault) };
    let encryptedEnv = {};
    try {
        encryptedEnv = { env: clj.vault(key, `${project.baseDir}/vault.txt`) };
    } catch {
        logger.info("no local encryptedEnv");
    }
    if (!options.cwd) {
        options.cwd = project.baseDir;
    }
    if (!options.env) {
        options.env = process.env;
    }
    const enriched = _.merge(options, defaultEncryptedEnv, encryptedEnv) as SpawnOptions;
    return enriched;
}

export const LeinBuilder = spawnBuilder(
    {
        name: "atomist.sh",
        commands: [asSpawnCommand("./atomist.sh", { env: {} })],
        errorFinder: (code, signal, l) => {
            return code !== 0;
        },
        logInterpreter: LogSuppressor,
        enrich,
        projectToAppInfo: async (p: GitProject) => {
            const projectClj = await p.findFile("project.clj");
            logger.info(`run projectToAppInfo in ${p.baseDir}/${projectClj.path}`);
            return {
                name: clj.getName(`${p.baseDir}/${projectClj.path}`),
                version: clj.getVersion(`${p.baseDir}/${projectClj.path}`),
                id: new GitHubRepoRef("owner", "repo"),
            };
        },
    },
);

export async function MetajarPreparation(p: GitProject, rwlc: GoalInvocation, event: GoalProjectListenerEvent): Promise<void | ExecuteGoalResult> {
    if (event === GoalProjectListenerEvent.before) {
        logger.info(`run ./metajar.sh from ${p.baseDir}`);
        const result = await spawnAndWatch(
            {
                command: "./metajar.sh",
                // args: ["with-profile", "metajar", "do", "clean,", "metajar"],
            },
            await enrich({}, p),
            rwlc.progressLog,
            {
                errorFinder: code => code !== 0,
            });
        return result;
    }
}

export const Metajar: GoalProjectListenerRegistration = {
    name: "metajar",
    pushTest: IsLein,
    listener: MetajarPreparation,
};

export const LeinProjectVersioner: ProjectVersioner = async (status, p) => {
    const file = path.join(p.baseDir, "project.clj");
    let projectVersion = clj.getVersion(file);
    if (projectVersion.endsWith("-SNAPSHOT")) {
        projectVersion = projectVersion.replace("-SNAPSHOT", "");
    }
    const branch = status.branch;
    // TODO - where did my defaultBranch go?
    const branchSuffix = branch !== "master" ? `${branch}.` : "";
    const v = `${projectVersion}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;

    await clj.setVersion(file, v);
    return v;
    // tslint:disable-next-line:max-file-line-count
};
