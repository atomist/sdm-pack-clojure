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
    GitHubRepoRef,
    GitProject,
    HandlerContext,
    logger,
} from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import {
    allSatisfied,
    ExecuteGoal,
    ExecuteGoalResult,
    ExtensionPack,
    GoalInvocation,
    GoalProjectListenerEvent,
    GoalProjectListenerRegistration,
    hasFile,
    LogSuppressor,
    metadata,
    not,
    SdmGoalEvent,
    spawnLog,
    ToDefaultBranch,
    WellKnownGoals,
} from "@atomist/sdm";
import {
    ProjectVersioner,
    readSdmVersion,
    Version,
} from "@atomist/sdm-core";
import { spawnBuilder } from "@atomist/sdm-pack-build";
import {
    DockerBuild,
    DockerImageNameCreator,
    DockerOptions,
} from "@atomist/sdm-pack-docker";
import { HasTravisFile } from "@atomist/sdm/lib/api-helper/pushtest/ci/ciPushTests";
import * as df from "dateformat";
import * as _ from "lodash";
import * as path from "path";
import {
    IsLein,
} from "../support/pushTest";
import { enrich } from "./enrich";
import {
    leinBuild,
    publish,
} from "./goals";
import {
    runConfusingDependenciesCheck,
    runDependencyCheckOnProject,
} from "./inspection";

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

export const imageNamer: DockerImageNameCreator =
    async (
        p: GitProject,
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

export interface LeinSupportOptions extends WellKnownGoals {
    version?: Version;
    dockerBuild?: DockerBuild;
}

export function leinSupport(goals: LeinSupportOptions): ExtensionPack {
    return {
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

            goals.version.with({
                name: "lein-version",
                versioner: LeinProjectVersioner,
                pushTest: IsLein,
            });

            goals.dockerBuild.with({
                name: "lein-docker-build",
                imageNameCreator: imageNamer,
                options: {
                    ...sdm.configuration.sdm.docker.jfrog as DockerOptions,
                    dockerfileFinder: async () => "docker/Dockerfile",
                    push: true,
                },
                pushTest: allSatisfied(IsLein, hasFile("docker/Dockerfile")),
            })
                .withProjectListener(Metajar);

            goals.autofixGoal.with({
                name: "cljformat",
                transform: async p => {
                    await clj.cljfmt((p as GitProject).baseDir);
                    return p;
                },
                pushTest: allSatisfied(IsLein, not(HasTravisFile), ToDefaultBranch),
            });

            goals.inspectGoal.with({
                name: "OWASP Dependency analysis",
                inspection: runDependencyCheckOnProject(),
            }).with({
                name: "Confusing Dependencies",
                inspection: runConfusingDependenciesCheck(),
            });
        },
    };
}

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

            return spawnLog(
                "lein",
                ["deploy"],
                {
                    ...await enrich({
                        cwd: project.baseDir,
                        env: process.env,
                    },
                        project,
                    ),
                    log: rwlc.progressLog,
                },
            );
        },
    );
};

export const LeinBuilder = spawnBuilder(
    {
        name: "atomist.sh",
        commands: [{ command: "./atomist.sh", args: [] }],
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
        const result = spawnLog(
            "./metajar.sh",
            [],
            {
                ...await enrich({}, p),
                log: rwlc.progressLog,
            },
        );
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
