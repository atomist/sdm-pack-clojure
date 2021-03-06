/*
 * Copyright © 2020 Atomist, Inc.
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
    logger,
} from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import {
    ExecuteGoal,
    ExecuteGoalResult,
    ExtensionPack,
    GoalInvocation,
    GoalProjectListenerEvent,
    GoalProjectListenerRegistration,
    LogSuppressor,
    metadata,
    spawnLog,
    WellKnownGoals,
} from "@atomist/sdm";
import {
    ProjectVersioner,
    readSdmVersion,
    Version,
} from "@atomist/sdm-core";
import { spawnBuilder } from "@atomist/sdm-pack-build";
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

export interface LeinSupportOptions extends WellKnownGoals {
    version?: Version;
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
    const branchSuffix = branch !== status.push.repo.defaultBranch ? `${branch}.` : "";
    const v = `${projectVersion}-${branchSuffix.replace(/\//g, "-")}${df(new Date(), "yyyymmddHHMMss")}`;

    await clj.setVersion(file, v);
    return v;
    // tslint:disable-next-line:max-file-line-count
};
