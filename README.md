cleopatra
=========

Store large files on S3, and make them available to everyone on your Google Apps domain.

Setup
======

Create a Google API key on [Google API Console](https://cloud.google.com/console), and authorize your domain and callback URL.

Create an S3 bucket, an Amazon DynamoDB table and an Amazon AWS IAM account with read access to the bucket and full access to the table.

Configure your S3 and Google credentials in config.json, including the name of the S3 bucket and Dynamo table.

Install the dependencies with `npm install`, then run `node app.js`. A Procfile is included for pushing to Heroku.

