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
    Autofix,
    goals,
    Goals,
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

export const dockerBuild = new DockerBuild();

// Just running review and autofix
export const CheckGoals: Goals = goals("Check")
    .plan(version).after(autofix);

export const DefaultBranchGoals: Goals = goals("Default Branch")
    .plan(autofix);

// Build including docker build
export const LeinBuildGoals: Goals = goals("Lein Build")
    .plan(CheckGoals)
    .plan(leinBuild).after(version);

export const LeinDefaultBranchBuildGoals: Goals = goals("Lein Build")
    .plan(DefaultBranchGoals, LeinBuildGoals)
    .plan(publish).after(leinBuild)
    .plan(tag).after(publish);

export const LeinDockerGoals: Goals = goals("Lein Docker Build")
    .plan(LeinBuildGoals)
    .plan(dockerBuild).after(leinBuild)
    .plan(tag).after(dockerBuild);
