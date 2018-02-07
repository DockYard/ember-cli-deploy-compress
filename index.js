/*eslint-env node*/
'use strict';

var RSVP      = require('rsvp');
var fs        = require('fs');
var path      = require('path');
var minimatch = require('minimatch');
var caniuse   = require('caniuse-api');

var denodeify  = require('rsvp').denodeify;
var renameFile = denodeify(fs.rename);

var DeployPluginBase = require('ember-cli-deploy-plugin');

module.exports = {
  name: 'ember-cli-deploy-compress',

  createDeployPlugin(options) {
    var fs = require('fs');
    let browsers = this._getBrowsers();
    let canUseBrotli = !!browsers && caniuse.isSupported('brotli', browsers);

    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,
      defaultConfig: {
        filePattern: '**/*.{js,css,json,ico,map,xml,txt,svg,eot,ttf,woff,woff2}',
        ignorePattern: null,
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
        if (canUseBrotli) {
          this.log("Using brotli for compression", { verbose: true });
          let lib = require('iltorb');
          this.buildCompressor = function() {
            return lib.compressStream({ quality: 11 });
          }
        } else if (this.readConfig('zopfli')) {
          this.log("Using zopfli for compression", { verbose: true });
          let lib = this.project.require('node-zopfli');
          this.buildCompressor = function() {
            return lib.createGzip({ format: 'gzip' });
          }
        } else {
          this.log("Using standard gzip for compression", { verbose: true });
          let lib = require('zlib');
          this.buildCompressor = function() {
            return lib.createGzip({ format: 'gzip' });
          }
        }
      },

      willUpload(/* context */) {
        var self = this;

        var filePattern     = this.readConfig('filePattern');
        var ignorePattern   = this.readConfig('ignorePattern');
        var distDir         = this.readConfig('distDir');
        var distFiles       = this.readConfig('distFiles') || [];
        var keep            = this.readConfig('keep');
        var outputProp      = canUseBrotli ? 'brotliCompressedFiles' : 'gzippedFiles';

        this.log('compressing `' + filePattern + '`', { verbose: true });
        this.log('ignoring `' + ignorePattern + '`', { verbose: true });

        return this._compressFiles(distDir, distFiles, filePattern, ignorePattern, keep)
          .then(function(compressedFiles) {
            self.log(`compressed ${compressedFiles.length} files ok`, { verbose: true });
            if (keep) {
              self.log('keep is enabled, added compressed files to `context.distFiles`', { verbose: true });
              return {
                distFiles: [].concat(compressedFiles), // needs to be a copy
                [outputProp]: compressedFiles
              };
            }
            return { [outputProp]: compressedFiles };
          })
          .catch(this._errorMessage.bind(this));
      },
      _compressFiles(distDir, distFiles, filePattern, ignorePattern, keep) {
        var filesToCompress = distFiles.filter(minimatch.filter(filePattern, { matchBase: true }));
        if (ignorePattern != null) {
            filesToCompress = filesToCompress.filter(function(path){
              return !minimatch(path, ignorePattern, { matchBase: true });
            });
        }
        return RSVP.map(filesToCompress, this._compressFile.bind(this, distDir, keep));
      },
      _compressFile(distDir, keep, filePath) {
        var self = this;
        var fullPath = path.join(distDir, filePath);
        var fileExtension = canUseBrotli ? '.br' : '.gz';
        var outFilePath = fullPath + fileExtension;
        return new RSVP.Promise(function(resolve, reject) {
          var inp = fs.createReadStream(fullPath);
          var out = fs.createWriteStream(outFilePath);

          inp.pipe(self.buildCompressor()).pipe(out);
          inp.on('error', function(err){
            reject(err);
          });
          out.on('error', function(err){
            reject(err);
          });
          out.on('finish', function(){
            resolve();
          });
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
      _errorMessage(error) {
        this.log(error, { color: 'red' });
        return RSVP.reject(error);
      }
    });
    return new DeployPlugin();
  },

  _getBrowsers() {
    return this.project && this.project.targets && this.project.targets.browsers;
  },
};
