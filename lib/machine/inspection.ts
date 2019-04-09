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
    logger,
    NoParameters,
    Project,
    ProjectFile,
    ProjectReview,
} from "@atomist/automation-client";
import {
    CodeInspection,
    LoggingProgressLog,
    spawnLog,
    SpawnLogResult,
    StringCapturingProgressLog,
} from "@atomist/sdm";
import * as _ from "lodash";
import { enrich } from "./enrich";

function checkVulnerabilites(f: ProjectFile): boolean {
    try {
        const report = JSON.parse(f.getContentSync());
        logger.info(`check for vulnerabilities: ${_.some(_.get(report, "dependencies"), "vulnerabilities")}`);
        logger.info(`length of vulnerabilities vector ${_.concat(_.map(_.filter(_.get(report, "dependencies"), "vulnerabilities"), "vulnerabilities")).length}`);
    } catch (e) {
        logger.error(e);
    }
    return false;
}

export function runDependencyCheckOnProject(): CodeInspection<ProjectReview, NoParameters> {

    return async (p: Project) => {

        const project: GitProject = p as GitProject;

        const review: ProjectReview = { repoId: project.id, comments: [] };

        const spawnOptions = await enrich({}, project);

        const result: SpawnLogResult = await spawnLog(
            "lein",
            ["with-profile", "-dev", "dependency-check", "--output-format", "JSON"],
            {
                ...spawnOptions,
                log: new LoggingProgressLog("dependency-check"),
                cwd: project.baseDir,
            },
        );

        try {
            if (result.code === 0) {
                const f: ProjectFile = await p.findFile("target/dependency-check-report.json");
                if (checkVulnerabilites(f)) {
                    review.comments.push({
                        category: "OWasp Dependency Check failed",
                        subcategory: "to fix",
                        severity: "warn",
                        detail: "please run `lein with-profile -dev dependency-check` to generate a new html report of the violation",
                    });
                }
            } else {
                logger.warn(`OWasp dependency check failed to run.  Result:  ${result.code}`);
            }
        } catch (e) {
            logger.warn(`OWasp dependency check failed to run.  Exception: ${e}`);
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

        const log = new StringCapturingProgressLog();
        const spawnOptions = await enrich({}, project);

        const result = await spawnLog(
            "lein",
            ["deps", ":tree"],
            {
                ...spawnOptions,
                cwd: project.baseDir,
                log,
                errorFinder: (code, signal, l) => l.log.includes("confusing"),
            },
        );

        if (!!result.error) {
            review.comments.push({
                severity: "error",
                detail: result.stderr,
                category: "dependency confusion",
                subcategory: "output"
            });
        }

        return review;
    };
}
