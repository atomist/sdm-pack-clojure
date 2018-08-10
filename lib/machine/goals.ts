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

import { Goal, IndependentOfEnvironment, Goals, ReviewGoal, goals, AutofixGoal, BuildGoal } from "@atomist/sdm";
import { VersionGoal, TagGoal, DockerBuildGoal } from "@atomist/sdm-core";

export const PublishGoal = new Goal({
    uniqueName: "Publish",
    environment: IndependentOfEnvironment,
    orderedName: "2-publish",
    displayName: "publish",
    workingDescription: "Publishing...",
    completedDescription: "Published",
    failedDescription: "Published failed",
});

// Just running review and autofix
export const CheckGoals: Goals = goals("Check")
    .plan(VersionGoal, ReviewGoal);

export const DefaultBranchGoals: Goals = goals("Default Branch")
    .plan(AutofixGoal, TagGoal);

// Build including docker build
export const LeinBuildGoals: Goals = goals("Lein Build")
    .plan(CheckGoals)
    .plan(BuildGoal).after(ReviewGoal);

export const LeinDefaultBranchBuildGoals: Goals = goals("Lein Build")
    .plan(LeinBuildGoals, DefaultBranchGoals)
    .plan(PublishGoal).after(BuildGoal);

export const LeinDockerGoals: Goals = goals("Lein Docker Build")
    .plan(LeinBuildGoals, DockerBuildGoal);
