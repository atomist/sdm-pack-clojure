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

import { Configuration } from "@atomist/automation-client";
import {
    goals,
    Goals,
    pushTest,
    PushTest,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import {
    configureSdm,
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import { LeinSupport } from "..";
import {
    autofix,
    checkDependencies,
    confusingVersions,
    dockerBuild,
    leinBuild,
    version,
} from "../lib/machine/goals";

// Just running review and autofix
export const CheckGoals: Goals = goals("Check")
    .plan(version, confusingVersions, checkDependencies).after(autofix);

export const DefaultBranchGoals: Goals = goals("Default Branch")
    .plan(autofix);

// Build including docker build
export const LeinBuildGoals: Goals = goals("Lein Build")
    .plan(CheckGoals)
    .plan(leinBuild).after(version);

export const LeinDefaultBranchBuildGoals: Goals = goals("Lein Build")
    .plan(DefaultBranchGoals, LeinBuildGoals)
    // .plan(publish).after(leinBuild)
    .plan(dockerBuild).after(leinBuild);

const IsLein: PushTest = pushTest(`contains package.json file`, async pci =>
    !!(await pci.project.getFile("project.clj")),
);

export function machineMaker(config: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: `${configuration.name}-test`,
            configuration: config,
        },
        whenPushSatisfies(IsLein)
            .itMeans("fingerprint a clojure project")
            .setGoals(LeinDefaultBranchBuildGoals));

    sdm.addExtensionPacks(LeinSupport);

    return sdm;
}

export const configuration: Configuration = {
    postProcessors: [
        configureSdm(machineMaker),
    ],
};
