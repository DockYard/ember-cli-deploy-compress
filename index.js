/*eslint-env node*/
'use strict';

var RSVP   = require('rsvp');
var fs        = require('fs');
var path      = require('path');
var minimatch = require('minimatch');

var denodeify = require('rsvp').denodeify;
var renameFile  = denodeify(fs.rename);

var DeployPluginBase = require('ember-cli-deploy-plugin');

module.exports = {
  name: 'ember-cli-deploy-gzip',

  createDeployPlugin: function(options) {
    var fs = require('fs');

    var DeployPlugin = DeployPluginBase.extend({
      name: options.name,
      defaultConfig: {
        filePattern: '**/*.{js,css,json,ico,map,xml,txt,svg,eot,ttf,woff,woff2}',
        ignorePattern: null,
        zopfli: false,
        keep: false,
        distDir: function(context){
          return context.distDir;
        },
        distFiles: function(context){
          return context.distFiles;
        }
      },

      configure: function(context) {
        this._super.configure.call(this, context);
        if (this.readConfig('zopfli')) {
          this.log("Using zopfli for compression", { verbose: true });
          this.gzipLibrary = this.project.require('node-zopfli');
        } else {
          this.gzipLibrary = require('zlib');
        }
      },

      willUpload: function(/* context */) {
        var self = this;

        var filePattern     = this.readConfig('filePattern');
        var ignorePattern   = this.readConfig('ignorePattern');
        var distDir         = this.readConfig('distDir');
        var distFiles       = this.readConfig('distFiles') || [];
        var keep            = this.readConfig('keep');

        this.log('gzipping `' + filePattern + '`', { verbose: true });
        this.log('ignoring `' + ignorePattern + '`', { verbose: true });
        return this._gzipFiles(distDir, distFiles, filePattern, ignorePattern, keep)
          .then(function(gzippedFiles) {
            self.log('gzipped ' + gzippedFiles.length + ' files ok', { verbose: true });
            if (keep) {
              self.log('keep is enabled, added gzipped files to `context.distFiles`', { verbose: true });
              return {
                distFiles: [].concat(gzippedFiles), // needs to be a copy
                gzippedFiles: gzippedFiles
              };
            }
            return { gzippedFiles: gzippedFiles };
          })
          .catch(this._errorMessage.bind(this));
      },
      _gzipFiles: function(distDir, distFiles, filePattern, ignorePattern, keep) {
        var filesToGzip = distFiles.filter(minimatch.filter(filePattern, { matchBase: true }));
        if (ignorePattern != null) {
            filesToGzip = filesToGzip.filter(function(path){
              return !minimatch(path, ignorePattern, { matchBase: true });
            });
        }
        return RSVP.map(filesToGzip, this._gzipFile.bind(this, distDir, keep));
      },
      _gzipFile: function(distDir, keep, filePath) {
        var self = this;
        var fullPath = path.join(distDir, filePath);
        var outFilePath = fullPath + '.gz';
        return new RSVP.Promise(function(resolve, reject) {
          var gzip = self.gzipLibrary.createGzip({ format: 'gzip' });
          var inp = fs.createReadStream(fullPath);
          var out = fs.createWriteStream(outFilePath);

          inp.pipe(gzip).pipe(out);
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
            return renameFile(fullPath + '.gz', fullPath).then(function() {
              return filePath;
            });
          } else {
            return filePath + '.gz';
          }
        }).then(function(outFilePath){
          self.log('✔  ' + outFilePath, { verbose: true });

          return outFilePath;
        });
      },
      _errorMessage: function(error) {
        this.log(error, { color: 'red' });
        return RSVP.reject(error);
      }
    });
    return new DeployPlugin();
  }
};
