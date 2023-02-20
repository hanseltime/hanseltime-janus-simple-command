#!/bin/bash

## Initializes developer machine data

yarnVersion=$(yarn --version)
if [[ yarnVersion = 1* ]]; then
    "PRE-STEP: please run 'corepack enable'.  Your yarn version is currently ${yarnVersion}"
    exit 1
fi