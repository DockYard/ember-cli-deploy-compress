# ember-cli-deploy-compress

> An ember-cli-deploy plugin to compress files in-place choosing between gzip or brotli compression automatically based on your supported browsers.

This plugins is more or less the fusion of [ember-cli-deploy-gzip](https://github.com/ember-cli-deploy/ember-cli-deploy-gzip) and [ember-cli-deploy-brotli](https://github.com/mfeckie/ember-cli-deploy-brotli) that smartly uses your matrix of supported browsers in `config/targets.js` and the information
from [caniuse.com](https://caniuse.com/#feat=brotli) to decide the best compression automatically.

## What is an ember-cli-deploy plugin?

A plugin is an addon that can be executed as a part of the ember-cli-deploy pipeline. A plugin will implement one or more of the ember-cli-deploy's pipeline hooks.

For more information on what plugins are and how they work, please refer to the [Plugin Documentation][1].

## Installation

Run the following command in your terminal:

```bash
ember install ember-cli-deploy-compress
```

## ember-cli-deploy Hooks Implemented

For detailed information on what plugin hooks are and how they work, please refer to the [Plugin Documentation][1].

- `configure`
- `willUpload`

## Configuration Options

For detailed information on how configuration of plugins works, please refer to the [Plugin Documentation][1].

### filePattern

Files matching this pattern will be compressed.
Note: image files such as `.png`, `.jpg` and `.gif` should not be compressed, as they already are.

*Default:* `'\*\*/\*.{js,css,json,ico,map,xml,txt,svg,eot,ttf,woff,woff2}'`

### ignorePattern

Files matching this pattern will *not* be compressed even if they match filePattern

*Default:* null

### distDir

The root directory where the files matching `filePattern` will be searched for. By default, this option will use the `distDir` property of the deployment context, provided by [ember-cli-deploy-build][2].

*Default:* `context.distDir`

### distFiles

The list of built project files. This option should be relative to `distDir` and should include the files that match `filePattern`. By default, this option will use the `distFiles` property of the deployment context, provided by [ember-cli-deploy-build][2].

*Default:* `context.distDir`

### zopfli

Use node-zopfli for gzip compression (better than regular gzip compression but worse that brotli compression. When brotli is not available for your
browsers it's a good option, but compression takes more time).

If set to `true`, you will need to `npm install node-zopfli --save-dev` in your app.

*Default:* `false`

### keep

Keep original file and write compressed data to `originalFile.gz` (or `originalFile.br`)

*Default:* `false`

## Prequisites

The following properties are expected to be present on the deployment `context` object:

- `distDir`      (provided by [ember-cli-deploy-build][2])
- `distFiles`    (provided by [ember-cli-deploy-build][2])

## Plugins known to work well with this one

[ember-cli-deploy-build][2]
[ember-cli-deploy-s3][3] (Starting in version 1.2.0)

## Running Tests

* `yarn test`

## Why `ember build` and `ember test` don't work

Since this is a node-only ember-cli addon, this package does not include many files and dependencies which are part of ember-cli's typical `ember build` and `ember test` processes.

[1]: http://ember-cli-deploy.github.io/ember-cli-deploy/plugins/ "Plugin Documentation"
[2]: https://github.com/zapnito/ember-cli-deploy-build "ember-cli-deploy-build"
[3]: https://github.com/zapnito/ember-cli-deploy-s3 "ember-cli-deploy-s3"
