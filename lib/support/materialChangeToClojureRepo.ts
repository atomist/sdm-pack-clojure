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

import { logger } from "@atomist/automation-client";
import {
    filesChangedSince,
    pushTest,
    PushTest,
} from "@atomist/sdm";

import * as _ from "lodash";

const ExtsToIgnore = ["README.md"];

export const MaterialChangeToClojureRepo: PushTest = pushTest("Material change to Clojure repo", async pci => {
    const changedFiles = await filesChangedSince(pci.project, pci.push);
    if (!changedFiles) {
        logger.info("Cannot determine if change is material on %j: can't enumerate changed files", pci.id);
        return true;
    }
    logger.debug(`MaterialChangeToClojureRepo: Changed files are [${changedFiles.join(",")}]`);

    if (_.every(changedFiles, file => {
        return _.some(ExtsToIgnore, ignore => {
            return file.endsWith(ignore);
        });
    })) {
        logger.debug("Change is immaterial on %j: changed files=[%s]", pci.id, changedFiles.join(","));
        return false;
    }

    logger.debug("Change is material on %j: changed files=[%s]", pci.id, changedFiles.join(","));
    return true;
});
