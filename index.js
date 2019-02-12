/*eslint-env node*/
'use strict';

var RSVP      = require('rsvp');
var fs        = require('fs');
var path      = require('path');
var minimatch = require('minimatch');
var caniuse   = require('caniuse-api');
var RSVP      = require('rsvp')
var denodeify = RSVP.denodeify;
var renameFile = denodeify(fs.rename);

var DeployPluginBase = require('ember-cli-deploy-plugin');
var validCompressions = ['best', 'gzip', 'brotli'];

module.exports = {
  name: 'ember-cli-deploy-compress',

  createDeployPlugin(options) {
    var fs = require('fs');

    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,
      canUseBrotli: false,
      defaultConfig: {
        filePattern: '**/*.{js,css,json,ico,map,xml,txt,svg,eot,ttf,woff,woff2,appcache,webmanifest}',
        ignorePattern: null,
        compression: ['best'],
        zopfli: false,
        keep: false,
        distDir(context){
          return context.distDir;
        },
        distFiles(context){
          return context.distFiles;
        }
      },

      configure(context) {
        this._super.configure.call(this, context);
        this._validateCompressionConfig();
      },

      willUpload(/* context */) {
        var self = this;

        var filePattern     = this.readConfig('filePattern');
        var ignorePattern   = this.readConfig('ignorePattern');
        var distDir         = this.readConfig('distDir');
        var distFiles       = this.readConfig('distFiles') || [];
        var keep            = this.readConfig('keep');

        this.log('compressing `' + filePattern + '`', { verbose: true });
        this.log('ignoring `' + ignorePattern + '`', { verbose: true });

        // Intentionally calling this as late as possible to give other addons a
        // chance to influence it somehow, e.g. through ENV variables.
        this._determineBrotliSupport();

        let promises = { gzippedFiles: [], brotliCompressedFiles: [] };
        if (this._mustCompressWithBrotli()) {
          this.log('Compressing files with brotli', { verbose: true });
          promises.brotliCompressedFiles = this._compressFiles(distDir, distFiles, filePattern, ignorePattern, keep, 'brotli');
        }
        if (this._mustCompressWithGzip()) {
          this.log('Compressing files with gzip', { verbose: true });
          promises.gzippedFiles = this._compressFiles(distDir, distFiles, filePattern, ignorePattern, keep, 'gzip');
        }
        return RSVP.hash(promises).then(function({ gzippedFiles, brotliCompressedFiles }) {
          self.log(`compressed ${gzippedFiles.length + brotliCompressedFiles.length} files ok`, { verbose: true });
          if (keep) {
            self.log('keep is enabled, added compressed files to `context.distFiles`', { verbose: true });
            return {
              distFiles: [].concat(gzippedFiles).concat(brotliCompressedFiles), // needs to be a copy
              gzippedFiles,
              brotliCompressedFiles
            };
          } else {
            return { gzippedFiles, brotliCompressedFiles };
          }
        }).catch(this._errorMessage.bind(this));
      },
      _compressFiles(distDir, distFiles, filePattern, ignorePattern, keep, format) {
        var filesToCompress = distFiles.filter(minimatch.filter(filePattern, { matchBase: true }));
        if (ignorePattern != null) {
            filesToCompress = filesToCompress.filter(function(path){
              return !minimatch(path, ignorePattern, { matchBase: true });
            });
        }
        return RSVP.map(filesToCompress, this._compressFile.bind(this, distDir, keep, format));
      },
      _compressFile(distDir, keep, format, filePath) {
        var self = this;
        var fullPath = path.join(distDir, filePath);
        var fileExtension = format === 'brotli' ? '.br' : '.gz';
        var outFilePath = fullPath + fileExtension;

        return new RSVP.Promise(function(resolve, reject) {
          var inp = fs.createReadStream(fullPath);
          var out = fs.createWriteStream(outFilePath);
          let compressor = self[format + 'Compressor']();
          inp.pipe(compressor).pipe(out);
          inp.on('error', function(err){ reject(err); });
          out.on('error', function(err){ reject(err); });
          out.on('finish', function(){ resolve(); });
        }).then(function(){
          if(!keep) {
            return renameFile(fullPath + fileExtension, fullPath).then(function() {
              return filePath;
            });
          } else {
            return filePath + fileExtension;
          }
        }).then(function(outFilePath){
          self.log('✔  ' + outFilePath, { verbose: true });

          return outFilePath;
        });
      },
      gzipCompressor() {
        if (this.readConfig('zopfli')) {
          let pkgName =
            this._hasPackage('node-zopfli-es') ? 'node-zopfli-es' :
            this._hasPackage('node-zopfli') ? 'node-zopfli' : null;

          if (pkgName === null) {
            throw new Error('No compatible zopfli package found. Install node-zopfli-es for zopfli support!');
          }

          return this.project.require(pkgName).createGzip({ format: 'gzip' })
        } else {
          return require('zlib').createGzip({ format: 'gzip' });
        }
      },

      brotliCompressor() {
        return require('iltorb').compressStream({ quality: 11 });
      },

      _hasPackage(pkgName) {
        return pkgName in this.project.dependencies();
      },
      _determineBrotliSupport() {
        let browsers = this.project && this.project.targets && this.project.targets.browsers;
        this.canUseBrotli = !!browsers && caniuse.isSupported('brotli', browsers);
      },
      _mustCompressWithBrotli() {
        let compression = this._getCompression();
        return compression.indexOf('brotli') > -1 || (compression.indexOf('best') > -1 && this.canUseBrotli);
      },
      _mustCompressWithGzip() {
        let compression = this._getCompression();
        return compression.indexOf('gzip') > -1 || (compression.indexOf('best') > -1 && !this.canUseBrotli);
      },
      _errorMessage(error) {
        this.log(error, { color: 'red' });
        return RSVP.reject(error);
      },
      _validateCompressionConfig() {
        let compression = this._getCompression();
        compression.forEach(function (value) {
          if (validCompressions.indexOf(value) === -1) {
            throw new Error(`The "compression" config option has a wrong value: "${value}"`);
          }
        });
        if (compression.indexOf('best') > -1 && compression.length > 1) {
          throw new Error('The "compression" config cannot combine "best" with other values');
        }
        if (compression.length > 1 && !this.readConfig('keep')) {
          throw new Error('You cannot compress using both brotli and gzip unless you enable the `keep` option');
        }
      },

      _getCompression() {
        let compression = this.readConfig('compression');
        if (!Array.isArray(compression)) {
          compression = [compression];
        }
        return compression;
      }
    });
    return new DeployPlugin();
  }
};
