/*
 * Copyright 2022 Code Intelligence GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import sms from "source-map-support";
import { RawSourceMap } from "source-map";
import {
	BabelFileResult,
	PluginItem,
	TransformOptions,
	transformSync,
} from "@babel/core";
import { hookRequire, TransformerOptions } from "istanbul-lib-hook";
import { codeCoverage } from "./plugins/codeCoverage";
import { compareHooks } from "./plugins/compareHooks";
import { functionHooks } from "./plugins/functionHooks";
import { hookManager } from "@jazzer.js/hooking";
import { EdgeIdStrategy, MemorySyncIdStrategy } from "./edgeIdStrategy";

interface SourceMaps {
	[file: string]: RawSourceMap;
}

const sourceMaps: SourceMaps = {};

/* Installs source-map-support handlers and returns a reset function */
export function installSourceMapSupport(): () => void {
	// Use the source-map-support library to enable in-memory source maps of
	// transformed code and error stack rewrites.
	// As there is no way to populate the source map cache of source-map-support,
	// an additional buffer is used to pass on the source maps from babel to the
	// library. This could be memory intensive and should be replaced by
	// tmp source map files, if it really becomes a problem.
	sms.install({
		hookRequire: true,
		retrieveSourceMap: (source) => {
			if (sourceMaps[source]) {
				return {
					map: sourceMaps[source],
					url: source,
				};
			}
			return null;
		},
	});
	return sms.resetRetrieveHandlers;
}

export type FilePredicate = (filepath: string) => boolean;

export function registerInstrumentor(includes: string[], excludes: string[]) {
	installSourceMapSupport();
	if (includes.includes("jazzer.js")) {
		unloadInternalModules();
	}

	const idStrategy: EdgeIdStrategy = new MemorySyncIdStrategy();

	const shouldInstrument = shouldInstrumentFn(includes, excludes);
	const shouldHook = hookManager.hasFunctionsToHook.bind(hookManager);
	hookRequire(
		() => true,
		(code: string, options: TransformerOptions): string => {
			return instrument(
				code,
				options.filename,
				shouldInstrument,
				shouldHook,
				idStrategy
			);
		}
	);
}

function unloadInternalModules() {
	console.log(
		"DEBUG: Unloading internal Jazzer.js modules for instrumentation..."
	);
	[
		"@jazzer.js/core",
		"@jazzer.js/fuzzer",
		"@jazzer.js/hooking",
		"@jazzer.js/instrumentor",
		"@jazzer.js/jest-runner",
	].forEach((module) => {
		delete require.cache[require.resolve(module)];
	});
}

export function shouldInstrumentFn(
	includes: string[],
	excludes: string[]
): FilePredicate {
	const cleanup = (settings: string[]) =>
		settings
			.filter((setting) => setting)
			.map((setting) => (setting === "*" ? "" : setting)); // empty string matches every file
	const cleanedIncludes = cleanup(includes);
	const cleanedExcludes = cleanup(excludes);
	return (filepath: string) => {
		const included =
			cleanedIncludes.find((include) => filepath.includes(include)) !==
			undefined;
		const excluded =
			cleanedExcludes.find((exclude) => filepath.includes(exclude)) !==
			undefined;
		return included && !excluded;
	};
}

function instrument(
	code: string,
	filename: string,
	shouldInstrument: FilePredicate,
	shouldHook: FilePredicate,
	idStrategy: EdgeIdStrategy
) {
	const transformations: PluginItem[] = [];
	const shouldInstrumentFile = shouldInstrument(filename);
	if (shouldInstrumentFile) {
		transformations.push(codeCoverage(idStrategy), compareHooks);
	}
	if (shouldHook(filename)) {
		transformations.push(functionHooks(filename));
	}
	if (shouldInstrumentFile) {
		idStrategy.startForSourceFile(filename);
	}

	const transformedCode =
		transform(filename, code, transformations)?.code || code;

	if (shouldInstrumentFile) {
		idStrategy.commitIdCount(filename);
	}

	return transformedCode;
}

export function transform(
	filename: string,
	code: string,
	plugins: PluginItem[],
	options: TransformOptions = {}
): BabelFileResult | null {
	if (plugins.length === 0) {
		return null;
	}
	const result = transformSync(code, {
		filename: filename,
		sourceFileName: filename,
		sourceMaps: true,
		plugins: plugins,
		...options,
	});
	if (result?.map) {
		const sourceMap = result.map;
		sourceMaps[filename] = {
			version: sourceMap.version.toString(),
			sources: sourceMap.sources ?? [],
			names: sourceMap.names,
			sourcesContent: sourceMap.sourcesContent,
			mappings: sourceMap.mappings,
		};
	}
	return result;
}
