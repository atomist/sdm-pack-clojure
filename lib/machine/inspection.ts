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
    GitProject,
    NoParameters,
    Project,
    ProjectReview,
} from "@atomist/automation-client";
import {
    CodeInspection,
    execPromise,
    ExecPromiseResult,
    LoggingProgressLog,
    spawnLog,
    SpawnLogResult,
} from "@atomist/sdm";
import { enrich } from "./enrich";

export function runDependencyCheckOnProject(): CodeInspection<ProjectReview, NoParameters> {

    return async (p: Project) => {

        const project: GitProject = p as GitProject;

        const review: ProjectReview = { repoId: project.id, comments: [] };

        const spawnOptions = await enrich({}, project);

        const result: SpawnLogResult = await spawnLog(
            "lein",
            ["with-profile", "-dev", "dependency-check", "--throw"],
            {
                ...spawnOptions,
                log: new LoggingProgressLog("dependency-check"),
                cwd: project.baseDir,
            },
        );

        if (result.code !== 0) {
            review.comments.push({
                category: "OWasp Dependency Check failed",
                severity: "warn",
                detail: "please run `lein with-profile -dev dependency-check` to generate a new html report of the violation",
            });
        }

        return review;
    };
}

export function runConfusingDependenciesCheck(): CodeInspection<ProjectReview, NoParameters> {
    return async (p: Project) => {

        const project: GitProject = p as GitProject;

        const review: ProjectReview = {
            repoId: p.id,
            comments: [],
        };

        const spawnOptions = await enrich({}, project);

        const result: ExecPromiseResult = await execPromise(
            "lein",
            ["deps", ":tree"],
            {
                ...spawnOptions,
                cwd: project.baseDir,
            },
        );

        if (result.stderr.includes("confusion")) {
            review.comments.push({
                severity: "error",
                detail: result.stderr,
                category: "dependency confusion",
            });
        }

        return review;
    };
}
