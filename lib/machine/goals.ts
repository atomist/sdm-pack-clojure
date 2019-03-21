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
    Autofix,
    GoalWithFulfillment,
    IndependentOfEnvironment,
} from "@atomist/sdm";
import {
    Tag,
    Version,
} from "@atomist/sdm-core";
import { Build } from "@atomist/sdm-pack-build";
import { DockerBuild } from "@atomist/sdm-pack-docker";

export const publish = new GoalWithFulfillment({
    uniqueName: "Publish",
    environment: IndependentOfEnvironment,
    orderedName: "2-publish",
    displayName: "publish",
    workingDescription: "Publishing...",
    completedDescription: "Published",
    failedDescription: "Published failed",
});

export const leinBuild = new Build();
export const autofix = new Autofix();
export const version = new Version();
export const tag = new Tag();
export const confusingVersions = new GoalWithFulfillment({
    uniqueName: "ConfusingVersions",
    displayName: "ConfusingVersions",
    orderedName: "1-confusingVersions",
    environment: IndependentOfEnvironment,
    workingDescription: "checking for confusing dependencies",
    completedDescription: "no confusing dependencies found",
    failedDescription: "project has conflicting dependencies",
});
export const checkDependencies = new GoalWithFulfillment({
    uniqueName: "CheckDependencies",
    displayName: "CheckDependencies",
    orderedName: "2-checkDependencies",
    environment: IndependentOfEnvironment,
    workingDescription: "checking for owasp violations",
    completedDescription: "owasp violation check passed",
    failedDescription: "project has violations",
    skippedDescription: "OWasp scanning not available",
});

export const dockerBuild = new DockerBuild();