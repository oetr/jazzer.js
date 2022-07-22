#!/usr/bin/env node
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

import yargs, { Argv } from "yargs";
import * as path from "path";
import { startFuzzing } from "./core";

yargs(process.argv.slice(2))
	.scriptName("jazzer")
	.parserConfiguration({
		"camel-case-expansion": false,
		"strip-aliased": true,
		"strip-dashed": true,
		"greedy-arrays": false,
	})
	.example(
		"$0 package/fuzzTarget -i packages/foo -i packages/bar",
		'Start a fuzzing run using the "fuzz" function exported by "fuzzTarget" ' +
			'and only instrument code in the "packages/a" and "packages/b" modules.'
	)
	.example(
		"$0 package/fuzzTarget corpus -- -max_total_time=60",
		'Start a fuzzing run using the "fuzz" function exported by "fuzzTarget" ' +
			'and use the directory "corpus" to store newly generated inputs. ' +
			'Also pass the "-max_total_time" flag to the internal fuzzing engine ' +
			"(libFuzzer) to stop the fuzzing run after 60 seconds."
	)
	.command(
		"$0 <fuzzTarget> [corpus..]",
		"Coverage-guided, in-process fuzzer for the Node.js platform. \n\n" +
			'The "fuzzTarget" module has to export a function "fuzz" which accepts ' +
			"a byte array as first parameter and uses that to invoke the actual " +
			"function to fuzz.\n\n" +
			'The "corpus" directory is optional and can be used to provide initial ' +
			"seed input. It is also used to store interesting inputs between fuzzing " +
			"runs.\n\n" +
			"To pass options to the internal fuzzing engine (libFuzzer) use a " +
			'double-dash, "--", to mark the end of the normal fuzzer arguments. ' +
			"An example is shown in the examples section of this help message.",
		(yargs: Argv) => {
			yargs
				.positional("fuzzTarget", {
					describe: "Name of the module that exports the fuzz target function.",
					type: "string",
				})
				.demandOption("fuzzTarget")

				.array("corpus")
				.positional("corpus", {
					describe:
						"Paths to the corpus directories. If not given, no initial " +
						"seeds are used nor interesting inputs saved.",
					type: "string",
				})

				.option("fuzzFunction", {
					describe: "Name of the fuzz target function.",
					type: "string",
					default: "fuzz",
					group: "Fuzzer:",
				})
				.hide("fuzzFunction")

				.array("instrumentation_includes")
				.option("instrumentation_includes", {
					describe:
						"Part of filepath names to include in the instrumentation. " +
						'A tailing "/" should be used to include directories and prevent ' +
						'confusion with filenames. "*" can be used to include all files.\n' +
						"Can be specified multiple times.",
					type: "string",
					alias: "i",
					group: "Fuzzer:",
					default: ["*"],
				})

				.array("instrumentation_excludes")
				.option("instrumentation_excludes", {
					describe:
						"Part of filepath names to exclude in the instrumentation. " +
						'A tailing "/" should be used to exclude directories and prevent ' +
						'confusion with filenames. "*" can be used to exclude all files.\n' +
						"Can be specified multiple times.",
					type: "string",
					alias: "e",
					group: "Fuzzer:",
					default: ["node_modules"],
				});
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(args: any) => {
			startFuzzing({
				fuzzTarget: path.join(process.cwd(), args.fuzzTarget),
				fuzzFunction: args.fuzzFunction,
				includes: args.instrumentation_includes.map((include: string) =>
					// empty string matches every file
					include === "*" ? "" : include
				),
				excludes: args.instrumentation_excludes.map((exclude: string) =>
					// empty string matches every file
					exclude === "*" ? "" : exclude
				),
				fuzzerOptions: args.corpus.concat(args._),
			});
		}
	)
	.help().argv;