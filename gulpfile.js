var gulp = require('gulp');
const { series } = require('gulp');
var del = require('del');
var rename = require('gulp-rename');
var install = require('gulp-install');
var zip = require('gulp-zip');
var AWS = require('aws-sdk');
var fs = require('fs');
var webpack = require('webpack-stream');
const log = require('fancy-log');

// First we need to clean out the dist folder and remove the compiled zip file.
function clean(cb) {
  del('./dist');
  cb();
}

function webpackit() {
  return gulp.src('src/Index.js')
  .pipe(webpack( require('./webpack-dev.config.js') ))
  .pipe(gulp.dest('dist/'));
}

// The js task could be replaced with gulp-coffee as desired.
function js() {
  return gulp
    .src("dist/index.js")
    .pipe(gulp.dest("dist/"));
}

// Here we want to install npm packages to dist, ignoring devDependencies.
function npm() {
  return gulp
    .src('./package.json')
    .pipe(gulp.dest('./dist/'))
    .pipe(install({production: true}));
}

// Next copy over environment variables managed outside of source control.
function env() {
  return gulp
    .src('./config.env.production')
    .pipe(rename('config.env'))
    .pipe(gulp.dest('./dist'));
}

// Now the dist directory is ready to go. Zip it.
function zipit() {
  return gulp
    .src(['dist/**/*', '!dist/package.json', 'dist/.*'])
    .pipe(zip('dist.zip'))
    .pipe(gulp.dest('./'));
}

// Per the gulp guidelines, we do not need a plugin for something that can be
// done easily with an existing node module. #CodeOverConfig
//
// Note: This presumes that AWS.config already has credentials. This will be
// the case if you have installed and configured the AWS CLI.
//
// See http://aws.amazon.com/sdk-for-node-js/
gulp.task('upload', function() {

  // NOTE: The environmental variables AWS_PROFILE and AWS_REGION should be defined

  var lambda = new AWS.Lambda();
  var functionName = 'video-events';

  lambda.getFunction({FunctionName: functionName}, function(err, data) {
    if (err) {
      if (err.statusCode === 404) {
        var warning = 'Unable to find lambda function ' + deploy_function + '. ';
        warning += 'Verify the lambda function name and AWS region are correct.';
        log.warn(warning);
      } else {
        var warning = 'AWS API request failed. ';
        warning += 'Check your AWS credentials and permissions.';
        log.warn(warning);
      }
    }

    // This is a bit silly, simply because these five parameters are required.
    var current = data.Configuration;
    var params = {
      FunctionName: functionName,
      Handler: current.Handler,
      Mode: current.Mode,
      Role: current.Role,
      Runtime: current.Runtime
    };

    fs.readFile('./dist.zip', function(err, data) {
      params['FunctionZip'] = data;
      lambda.uploadFunction(params, function(err, data) {
        if (err) {
          var warning = 'Package upload failed. '
          warning += 'Check your iam:PassRole permissions.'
          log.warn(warning);
        }
      });
    });
  });
});

exports.dist = series(clean, webpackit, series(js, npm, env), zipit);
