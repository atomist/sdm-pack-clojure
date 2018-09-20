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
    AutofixGoal,
    Build,
    Goal,
    goals,
    Goals,
    IndependentOfEnvironment,
} from "@atomist/sdm";

import {
    DockerBuildGoal,
    TagGoal,
    VersionGoal,
} from "@atomist/sdm/lib/pack/well-known-goals/commonGoals";

export const PublishGoal = new Goal({
    uniqueName: "Publish",
    environment: IndependentOfEnvironment,
    orderedName: "2-publish",
    displayName: "publish",
    workingDescription: "Publishing...",
    completedDescription: "Published",
    failedDescription: "Published failed",
});

export const LeinBuildGoal = new Build();

// Just running review and autofix
export const CheckGoals: Goals = goals("Check")
    .plan(VersionGoal);

export const DefaultBranchGoals: Goals = goals("Default Branch")
    .plan(AutofixGoal, TagGoal);

// Build including docker build
export const LeinBuildGoals: Goals = goals("Lein Build")
    .plan(CheckGoals)
    .plan(LeinBuildGoal).after(AutofixGoal);

export const LeinDefaultBranchBuildGoals: Goals = goals("Lein Build")
    .plan(LeinBuildGoals, DefaultBranchGoals)
    .plan(PublishGoal).after(LeinBuildGoal);

export const LeinDockerGoals: Goals = goals("Lein Docker Build")
    .plan(LeinBuildGoals, DockerBuildGoal);
