/*
 * Copyright © 2018 Atomist, Inc.
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
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import { GitHubRepoRef } from "@atomist/automation-client/operations/common/GitHubRepoRef";

import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import * as clj from "@atomist/clj-editors";

import {
    allSatisfied,
    Builder,
    ExecuteGoalResult,
    ExecuteGoalWithLog,
    ExtensionPack,
    hasFile,
    not,
    RunWithLogContext,
    SdmGoalEvent,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineOptions,
    ToDefaultBranch,
} from "@atomist/sdm";
import {
    DockerBuildGoal,
    DockerOptions,
    executeDockerBuild,
    executeVersioner,
    readSdmVersion,
    VersionGoal,
} from "@atomist/sdm-core";
import { ProjectVersioner } from "@atomist/sdm-core/internal/delivery/build/local/projectVersioner";
import { SpawnBuilder } from "@atomist/sdm-core/internal/delivery/build/local/SpawnBuilder";
import { IsLein } from "@atomist/sdm-core/pack/clojure/pushTests";
import { DockerImageNameCreator } from "@atomist/sdm-core/pack/docker/executeDockerBuild";
import * as build from "@atomist/sdm/api-helper/dsl/buildDsl";

import { LogSuppressor } from "@atomist/sdm/api-helper/log/logInterpreters";
import {
    asSpawnCommand,
    spawnAndWatch,
} from "@atomist/sdm/api-helper/misc/spawned";
import { HasTravisFile } from "@atomist/sdm/api-helper/pushtest/ci/ciPushTests";
import { SpawnOptions } from "child_process";
import * as df from "dateformat";
import * as fs from "fs";
import * as _ from "lodash";
import * as path from "path";
import {
    PublishGoal,
} from "./goals";
import { rwlcVersion } from "./release";

const imageNamer: DockerImageNameCreator =
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
            version: newversion,
        };
    };

export const LeinSupport: ExtensionPack = {
    name: "Leiningen Support",
    vendor: "Atomist",
    version: "0.1.0",
    configure: sdm => {

        sdm.addBuildRules(
            build.when(IsLein)
                .itMeans("Lein build")
                .set(leinBuilder(sdm)),
        );
        sdm.addGoalImplementation("Deploy Jar", PublishGoal,
            leinDeployer(sdm.configuration.sdm));
        sdm.addGoalImplementation("leinVersioner", VersionGoal,
            executeVersioner(sdm.configuration.sdm.projectLoader, LeinProjectVersioner), { pushTest: IsLein });
        sdm.addGoalImplementation("leinDockerBuild", DockerBuildGoal,
            executeDockerBuild(
                sdm.configuration.sdm.projectLoader,
                imageNamer,
                [MetajarPreparation],
                {
                    ...sdm.configuration.sdm.docker.jfrog as DockerOptions,
                    dockerfileFinder: async () => "docker/Dockerfile",
                }), { pushTest: allSatisfied(IsLein, hasFile("docker/Dockerfile")) });

        sdm.addAutofix(
            {
                name: "cljformat",
                transform: async p => {
                    await clj.cljfmt((p as GitProject).baseDir);
                    return p;
                },
                pushTest: allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
            });
    },
};

function leinDeployer(sdm: SoftwareDeliveryMachineOptions): ExecuteGoalWithLog {
    return async (rwlc: RunWithLogContext): Promise<ExecuteGoalResult> => {
        const { credentials, id, context } = rwlc;
        const version = await rwlcVersion(rwlc);

        return sdm.projectLoader.doWithProject({
            credentials,
            id,
            readOnly: false,
            context,
        },
            async (project: GitProject) => {
                const file = path.join(project.baseDir, "project.clj");
                await clj.setVersion(file, version);
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
}

/**
 * Add stuff from vault to env
 * @param options original options
 * @param project optional project
 */
async function enrich(options: SpawnOptions = {}, project: GitProject): Promise<SpawnOptions> {
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

function leinBuilder(sdm: SoftwareDeliveryMachine): Builder {
    return new SpawnBuilder(
        {
            sdm,
            options: {
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
        });
}

export async function MetajarPreparation(p: GitProject, rwlc: RunWithLogContext): Promise<ExecuteGoalResult> {
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

export const LeinProjectVersioner: ProjectVersioner = async (status, p) => {
    const file = path.join(p.baseDir, "project.clj");
    let projectVersion = clj.getVersion(file);
    if (projectVersion.endsWith("-SNAPSHOT")) {
        projectVersion = projectVersion.replace("-SNAPSHOT", "");
    }
    const branch = status.branch;
    // TODO - where did my defaultBranch go?
    const branchSuffix = branch !== "master" ? `${branch}.` : "";
    const version = `${projectVersion}-${branchSuffix}${df(new Date(), "yyyymmddHHMMss")}`;

    await clj.setVersion(file, version);
    return version;
    // tslint:disable-next-line:max-file-line-count
};
