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
    hasLeinPlugin,
} from "@atomist/clj-editors";
import {
    hasFile,
    hasFileWithExtension,
    PredicatePushTest,
    pushTest,
} from "@atomist/sdm";
import * as path from "path";

export const IsClojure: PredicatePushTest = hasFileWithExtension("clj");
export const IsLein = hasFile("project.clj");

export const HasLeinPlugin = (symbol: string) => {
    return pushTest("HasLeinPlugin", async p => {
        const file = path.join(p.project.baseDir, "project.clj");
        return hasLeinPlugin(file, symbol);
    });
};
