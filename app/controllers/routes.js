var fs = require('fs');
var _ = require('lodash');
var expressJwt = require('express-jwt');
var status = require('../lib/status.js');
var config = require('config');

module.exports = function(app) {

  /**
   * Public methods.
   */
  var Controllers = app.set('controllers');
  var mw = Controllers.middlewares;
  var users = Controllers.users;
  var auth = Controllers.auth;
  var params = Controllers.params;
  var groups = Controllers.groups;
  var activities = Controllers.activities;
  var transactions = Controllers.transactions;
  var payments = Controllers.payments;
  var paypal = Controllers.paypal;
  var images = Controllers.images;
  var errors = app.errors;

  /**
   * Status.
   */
  app.get('/status', status);

  /**
   * Parameters.
   */
  app.param('userid', params.userid);
  app.param('groupid', params.groupid);
  app.param('transactionid', params.transactionid);
  app.param('paykey', params.paykey);

  /**
   * Authentication.
   */
  app.use(mw.apiKey, expressJwt({secret: config.keys.opencollective.secret, userProperty: 'remoteUser', credentialsRequired: false}), mw.identifyFromToken);

  /**
   * NotImplemented response.
   */
  var NotImplemented = function(req, res, next) {
    return next(new errors.NotImplemented('Not implemented yet.'));
  };

  /**
   * Users.
   */
  app.post('/users', mw.required('api_key'), mw.authorizeApp, mw.appAccess(0.5), mw.required('user'), users.create); // Create a user.
  app.get('/users/:userid', mw.authorizeAuthUser, users.show); // Get a user.
  app.put('/users/:userid', NotImplemented); // Update a user.
  app.get('/users/:userid/email', NotImplemented); // Confirm a user's email.

  /**
   * Authentication.
   */
  app.post('/authenticate', mw.required('api_key'), mw.authorizeApp, mw.required('password'), mw.authenticate, auth.byPassword, users.getToken); // Authenticate user to get a token.
  app.post('/authenticate/refresh', NotImplemented); // Refresh the token (using a valid token OR a expired token + refresh_token).
  app.post('/authenticate/reset', NotImplemented); // Reset the refresh_token.

  /**
   * Credit card.
   *
   *  Let's assume for now a card is linked to a user.
   */
  app.post('/users/:userid/cards', NotImplemented); // Create a user's card.
  app.put('/users/:userid/cards/:cardid', NotImplemented); // Update a user's card.
  app.delete('/users/:userid/cards/:cardid', NotImplemented); // Delete a user's card.

  /**
   * Paypal Preapproval.
   */
  app.get('/users/:userid/paypal/preapproval', mw.authorizeAuthUser, mw.authorizeUser, paypal.getPreapprovalKey); // Get a user's preapproval key.
  app.post('/users/:userid/paypal/preapproval/:preapprovalkey', mw.authorizeAuthUser, mw.authorizeUser, paypal.confirmPreapproval); // Confirm a preapproval key.

  /**
   * Groups.
   */
  app.post('/groups', mw.authorizeAuthUser, mw.required('group'), groups.create); // Create a group. Option `role` to assign the caller directly (default to null).
  app.get('/groups/:groupid', mw.authorizeAuthUserOrApp, mw.authorizeGroup, groups.get);
  app.put('/groups/:groupid', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.authorizeGroupRoles('admin'), mw.required('group'), groups.update); // Update a group.
  app.delete('/groups/:groupid', NotImplemented); // Delete a group.

  app.post('/groups/:groupid/payments', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.required('payment'), payments.post); // Make a payment/donation.

  /**
   * UserGroup.
   *
   *  Relations between a group and a user.
   */
  app.get('/users/:userid/groups', mw.authorizeAuthUser, mw.authorizeUser, users.getGroups); // Get user's groups.
  app.post('/groups/:groupid/users/:userid', mw.authorizeAuthUser, mw.authorizeGroup, mw.authorizeGroupRoles('admin'), groups.addMember); // Add a user to a group.
  app.put('/groups/:groupid/users/:userid', mw.authorizeAuthUser, mw.authorizeGroup, mw.authorizeGroupRoles('admin'), groups.updateMember); // Update a user's role in a group.
  app.delete('/groups/:groupid/users/:userid', mw.authorizeAuthUser, mw.authorizeGroup, mw.authorizeGroupRoles('admin'), groups.deleteMember); // Remove a user from a group.

  /**
   * Transactions (financial).
   */
  app.get('/groups/:groupid/transactions', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.paginate(), mw.sorting({key: 'createdAt', dir: 'DESC'}), groups.getTransactions); // Get a group's transactions.
  app.post('/groups/:groupid/transactions', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.required('transaction'), groups.createTransaction); // Create a transaction for a group.

  app.get('/groups/:groupid/transactions/:transactionid', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.authorizeTransaction, groups.getTransaction); // Get a transaction.
  app.delete('/groups/:groupid/transactions/:transactionid', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.authorizeTransaction, groups.deleteTransaction); // Delete a transaction.
  app.post('/groups/:groupid/transactions/:transactionid/approve', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.authorizeTransaction, mw.required('approved'), transactions.approve); // Approve a transaction.
  app.post('/groups/:groupid/transactions/:transactionid/pay', mw.authorizeAuthUser, mw.authorizeGroup, mw.authorizeGroupRoles(['admin', 'writer']), mw.authorizeTransaction, mw.required('service'), transactions.pay); // Pay a transaction.
  app.get('/groups/:groupid/transactions/:transactionid/paykey', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.authorizeGroupRoles(['admin', 'writer']), mw.authorizeTransaction, transactions.getPayKey); // Get a transaction's pay key.
  app.post('/groups/:groupid/transactions/:transactionid/paykey/:paykey', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.authorizeGroupRoles(['admin', 'writer']), mw.authorizeTransaction, transactions.confirmPayment); // Confirm a transaction's payment.
  app.post('/groups/:groupid/transactions/:transactionid/attribution/:userid', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.authorizeTransaction, mw.authorizeGroupRoles(['admin', 'writer']), transactions.attributeUser); // Attribute a transaction to a user.

  /**
   * Activities.
   *
   *  An activity is any action linked to a User or a Group.
   */
  app.get('/groups/:groupid/activities', mw.authorizeAuthUserOrApp, mw.authorizeGroup, mw.paginate(), mw.sorting({key: 'createdAt', dir: 'DESC'}), activities.group); // Get a group's activities.
  app.get('/users/:userid/activities', mw.authorizeAuthUser, mw.authorizeUser, mw.paginate(), mw.sorting({key: 'createdAt', dir: 'DESC'}), activities.user); // Get a user's activities.

  /**
   * Separate route for uploading images to S3
   */
  app.post('/images', mw.authorizeAuthUser, images.upload);

  /**
   * Error handler.
   */
  app.use(function(err, req, res, next) {
    var name = err.name;

    if (name === 'UnauthorizedError') // because of jwt-express
      err.code = err.status;
    res.header('Cache-Control', 'no-cache');

    // Validation error.
    var e = name && name.toLowerCase ? name.toLowerCase() : '';
    if (e.indexOf('validation') !== -1)
      err = new errors.ValidationFailed(null, _.map(err.errors, function(e) { return e.path; }), err.message);
    else if (e.indexOf('uniqueconstraint') !== -1)
      err = new errors.ValidationFailed(null, _.map(err.errors, function(e) { return e.path; }), 'Unique Constraint Error.');

    if (!err.code)
      err.code = err.status || 500;

    console.error('Error Express : ', err); // console.trace(err);
    res.status(err.code).send({error: err});
  });

};
