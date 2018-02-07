/*eslint-env node*/
'use strict';

var RSVP = require('rsvp');
var assert = require('./helpers/assert');
var fs  = require('fs');
var path  = require('path');
var rimraf  = RSVP.denodeify(require('rimraf'));

describe('compress plugin', function() {
  var subject, mockUi, config;

  beforeEach(function() {
    subject = require('../index');
    mockUi = {
      verbose: true,
      messages: [],
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      }
    };
  });

  it('has a name', function() {
    var result = subject.createDeployPlugin({
      name: 'test-plugin'
    });

    assert.equal(result.name, 'test-plugin');
  });

  it('implements the correct hooks', function() {
    var result = subject.createDeployPlugin({
      name: 'test-plugin'
    });

    assert.equal(typeof result.configure, 'function');
    assert.equal(typeof result.willUpload, 'function');
  });

  describe('configure hook', function() {
    var plugin, context;

    describe('without providing config', function () {
      beforeEach(function() {
        config = { };
        plugin = subject.createDeployPlugin({
          name: 'compress'
        });
        context = {
          ui: mockUi,
          config: config
        };
        plugin.beforeHook(context);
      });
      it('warns about missing optional config', function() {
        plugin.configure(context);
        var messages = mockUi.messages.reduce(function(previous, current) {
          if (/- Missing config:\s.*, using default:\s/.test(current)) {
            previous.push(current);
          }

          return previous;
        }, []);

        assert.equal(messages.length, 7);
      });

      it('adds default config to the config object', function() {
        plugin.configure(context);
        assert.isDefined(config.compress.filePattern);
        assert.isDefined(config.compress.ignorePattern);
        assert.isDefined(config.compress.distDir);
        assert.isDefined(config.compress.distFiles);
        assert.isDefined(config.compress.zopfli);
      });
    });

    describe('with a filePattern, ignorePattern, zopfli, distDir, and distFiles provided', function () {
      beforeEach(function() {
        config = {
          compress: {
            filePattern: '**/*.*',
            ignorePattern: '**/specific.thing',
            zopfli: false,
            compression: ['best'],
            keep: false,
            distDir: 'tmp/dist-deploy',
            distFiles: []
          }
        };
        plugin = subject.createDeployPlugin({
          name: 'compress'
        });
        context = {
          ui: mockUi,
          config: config
        };
        plugin.beforeHook(context);
      });

      it('does not warn about missing optional config', function() {
        plugin.configure(context);
        var messages = mockUi.messages.reduce(function(previous, current) {
          if (/- Missing config:\s.*, using default:\s/.test(current)) {
            previous.push(current);
          }

          return previous;
        }, []);
        assert.equal(messages.length, 0);
      });

      it('throws an error if the `compression` contains something other then `best`, `gzip` or `brotli`', function() {
        context.config.compress.compression = ['rar'];
        assert.throws(() => plugin.configure(context), 'The "compression" config option has a wrong value: "rar"')
      });

      it('allows the `compress` option to be a string instead of an array', function() {
        context.config.compress.compression = 'gzip';
        assert.doesNotThrow(() => plugin.configure(context))
      });

      it('throws an error if the `compression` contains `best` and any other value', function () {
        context.config.compress.compression = ['best', 'gzip'];
        assert.throws(() => plugin.configure(context), 'The "compression" config cannot combine "best" with other values')
      });
    });
  });

  describe('willUpload hook', function() {
    var plugin;
    var context;

    beforeEach(function() {
      plugin = subject.createDeployPlugin({
        name: 'compress'
      });

      context = {
        distDir: 'tmp/test-dist',
        distFiles: [
          'assets/foo.js',
          'assets/bar.notjs',
          'assets/ignore.js',
        ],
        ui: mockUi,
        project: { name: function() { return 'test-project'; } },
        config: {
          compress: {
            filePattern: '**/*.js',
            ignorePattern: '**/ignore.*',
            distDir: function(context){ return context.distDir; },
            distFiles: function(context){ return context.distFiles; }
          }
        }
      };
      if (!fs.existsSync('tmp')) { fs.mkdirSync('tmp'); }
      if (!fs.existsSync(context.distDir)) { fs.mkdirSync(context.distDir); }
      if (!fs.existsSync(path.join(context.distDir, 'assets'))) { fs.mkdirSync(path.join(context.distDir, 'assets')); }
      fs.writeFileSync(path.join(context.distDir, context.distFiles[0]), 'alert("Hello foo world!");', 'utf8');
      fs.writeFileSync(path.join(context.distDir, context.distFiles[1]), 'alert("Hello bar world!");', 'utf8');
      fs.writeFileSync(path.join(context.distDir, context.distFiles[2]), 'alert("Hello ignore world!");', 'utf8');
      plugin.beforeHook(context);
      let lib = require('zlib');
      plugin.buildCompressor = function() {
        return lib.createGzip({ format: 'gzip' });
      };
    });

    afterEach(function(){
      return rimraf(context.distDir);
    });

    describe('When brotli compression is not possible', function() {
      it('gzips the matching files which are not ignored', function() {
        assert.isFulfilled(plugin.willUpload(context))
          .then(function(result) {
            assert.deepEqual(result, { gzippedFiles: ['assets/foo.js'] });
            done();
          }).catch(function(reason){
            done(reason);
          });
      });

      describe('when keep is enabled', function() {
        beforeEach(function() {
          context.config.compress.keep = true;
        });

        it('gzips the matching files with .gz suffix', function(done) {
          assert.isFulfilled(plugin.willUpload(context))
            .then(function(result) {
              assert.deepEqual(result.gzippedFiles, ['assets/foo.js.gz']);
              done();
            }).catch(function(reason){
              done(reason);
            });
        });

        it('adds the gzipped files to the distFiles', function(done) {
          assert.isFulfilled(plugin.willUpload(context))
            .then(function(result) {
              assert.include(result.distFiles, 'assets/foo.js.gz');
              done();
            }).catch(function(reason){
              done(reason);
            });
        });

        it('does not use the same object for gzippedFiles and distFiles', function(done) {
          assert.isFulfilled(plugin.willUpload(context))
            .then(function(result) {
              assert.notStrictEqual(result.distFiles, result.gzippedFiles);
              done();
            }).catch(function(reason){
              done(reason);
            });
        });
      });
    });

    describe('When brotli compression is possible', function () {
      beforeEach(function() {
        plugin.supportsBrotli = true;
        let lib = require('iltorb');
        plugin.buildCompressor = function () {
          return lib.compressStream({ quality: 11 });
        };
      });

      it('compresses with brotli the matching files which are not ignored', function () {
        assert.isFulfilled(plugin.willUpload(context))
          .then(function (result) {
            assert.deepEqual(result, { brotliCompressedFiles: ['assets/foo.js'] });
            done();
          }).catch(function (reason) {
            done(reason);
          });
      });

      describe('when keep is enabled', function () {
        beforeEach(function () {
          context.config.compress.keep = true;
        });

        it('compresses with brotli the matching files with .br suffix', function (done) {
          assert.isFulfilled(plugin.willUpload(context))
            .then(function (result) {
              assert.deepEqual(result.brotliCompressedFiles, ['assets/foo.js.br']);
              done();
            }).catch(function (reason) {
              done(reason);
            });
        });

        it('adds the brotli-compressed files to the distFiles', function (done) {
          assert.isFulfilled(plugin.willUpload(context))
            .then(function (result) {
              assert.include(result.distFiles, 'assets/foo.js.br');
              done();
            }).catch(function (reason) {
              done(reason);
            });
        });

        it('does not use the same object for brotliCompressedFiles and distFiles', function (done) {
          assert.isFulfilled(plugin.willUpload(context))
            .then(function (result) {
              assert.notStrictEqual(result.distFiles, result.brotliCompressedFiles);
              done();
            }).catch(function (reason) {
              done(reason);
            });
        });
      });
    });
  });
});
