Cleopatra
=========

Store large files on S3, and make them available to everyone on your Google Apps domain.

Setup
======

Create a Google API key on [Google API Console](https://cloud.google.com/console), and authorize your domain and callback URL.

Create an S3 bucket, an Amazon DynamoDB table and an Amazon AWS IAM account with read access to the bucket and full access to the table.

Configure your S3 and Google credentials in config.json, including the name of the S3 bucket and Dynamo table.

Install the dependencies with `npm install`, then run `node app.js`. A Procfile is included for pushing to Heroku.

License
=======

Copyright 2013 The Pythian Group, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
