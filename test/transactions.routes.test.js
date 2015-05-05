/**
 * Dependencies.
 */
var expect    = require('chai').expect
  , request   = require('supertest')
  , _         = require('lodash')
  , async     = require('async')
  , app       = require('../index')
  , utils     = require('../test/utils.js')()
  , config    = require('config')
  ;

/**
 * Variables.
 */
var userData = utils.data('user1');
var groupData = utils.data('group1');
var models = app.set('models');
var transactionsData = utils.data('transactions1').transactions;

/**
 * Tests.
 */
describe('transactions.routes.test.js', function() {

  var group, group2, user, user2, application, application2, application3;

  beforeEach(function(done) {
    utils.cleanAllDb(function(e, app) {
      application = app;
      done();
    });
  });

  // Create user.
  beforeEach(function(done) {
    models.User.create(utils.data('user1')).done(function(e, u) {
      expect(e).to.not.exist;
      user = u;
      done();
    });
  });

  // Create user2.
  beforeEach(function(done) {
    models.User.create(utils.data('user2')).done(function(e, u) {
      expect(e).to.not.exist;
      user2 = u;
      done();
    });
  });

  // Create the group.
  beforeEach(function(done) {
    models.Group.create(groupData).done(function(e, g) {
      expect(e).to.not.exist;
      group = g;
      done();
    });
  });

  // Create the group2.
  beforeEach(function(done) {
    models.Group.create(utils.data('group2')).done(function(e, g) {
      expect(e).to.not.exist;
      group2 = g;
      done();
    });
  });

  // Add user to the group.
  beforeEach(function(done) {
    group
      .addMember(user, {role: 'admin'})
      .done(done);
  });

  // Add user to the group2.
  beforeEach(function(done) {
    group2
      .addMember(user, {role: 'admin'})
      .done(done);
  });

  // Create an application which has only access to `group`
  beforeEach(function(done) {
    models.Application.create(utils.data('application2')).done(function(e, a) {
      expect(e).to.not.exist;
      application2 = a;
      application2.addGroup(group).done(done);
    });
  });

  // Create an independent application.
  beforeEach(function(done) {
    models.Application.create(utils.data('application3')).done(function(e, a) {
      expect(e).to.not.exist;
      application3 = a;
      done();
    });
  });

  /**
   * Create.
   */
  describe('#create', function() {

    it('fails creating a transaction if no authenticated', function(done) {
      request(app)
        .post('/groups/' + group.id + '/transactions')
        .send({
          transaction: transactionsData[0]
        })
        .expect(401)
        .end(done);
    });

    it('fails creating a transaction if no transaction passed', function(done) {
      request(app)
        .post('/groups/' + group.id + '/transactions')
        .send({
          api_key: application2.api_key
        })
        .expect(400)
        .end(done);
    });

    it('fails creating a transaction if user has no access to the group', function(done) {
      request(app)
        .post('/groups/' + group.id + '/transactions')
        .set('Authorization', 'Bearer ' + user2.jwt(application))
        .send({
          transaction: transactionsData[0]
        })
        .expect(403)
        .end(done);
    });

    it('fails creating a transaction if application has no access to the group', function(done) {
      request(app)
        .post('/groups/' + group.id + '/transactions')
        .send({
          api_key: application3.api_key,
          transaction: transactionsData[0]
        })
        .expect(403)
        .end(done);
    });

    it('successfully create a transaction with an application', function(done) {
      request(app)
        .post('/groups/' + group.id + '/transactions')
        .send({
          api_key: application2.api_key,
          transaction: transactionsData[0]
        })
        .expect(200)
        .end(function(e, res) {
          expect(e).to.not.exist;
          var t = res.body;
          expect(t).to.have.property('id');
          expect(t).to.have.property('currency', 'USD');
          expect(t).to.have.property('beneficiary', transactionsData[0].beneficiary);
          expect(t).to.have.property('GroupId', group.id);
          expect(t).to.have.property('UserId', null); // ...

          models.Activity.findAndCountAll({}).then(function(res) {
            expect(res.rows[0]).to.have.property('TransactionId', t.id);
            expect(res.count).to.equal(1);
            done();
          });

        });
    });

    it('successfully create a transaction with a user', function(done) {
      request(app)
        .post('/groups/' + group.id + '/transactions')
        .set('Authorization', 'Bearer ' + user.jwt(application))
        .send({
          transaction: transactionsData[0]
        })
        .expect(200)
        .end(function(e, res) {
          expect(e).to.not.exist;
          expect(res.body).to.have.property('GroupId', group.id);
          expect(res.body).to.have.property('UserId', user.id); // ...

          models.Activity.findAndCountAll({}).then(function(res) {
            expect(res.count).to.equal(1);
            done();
          });

        });
    });

  });

  /**
   * Delete.
   */
  describe('#delete', function() {

    var transactions = [];

    // Create transactions.
    beforeEach(function(done) {
      async.each(transactionsData, function(transaction, cb) {
        request(app)
          .post('/groups/' + group.id + '/transactions')
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .send({
            transaction: transaction
          })
          .expect(200)
          .end(function(e, res) {
            expect(e).to.not.exist;
            transactions.push(res.body);
            cb();
          });
      }, done);
    });

    it('fails deleting a non-existing transaction', function(done) {
      request(app)
        .delete('/groups/' + group.id + '/transactions/' + 987123)
        .set('Authorization', 'Bearer ' + user.jwt(application))
        .expect(404)
        .end(done);
    });

    it('fails deleting a transaction which does not belong to the group', function(done) {
      request(app)
        .delete('/groups/' + group2.id + '/transactions/' + transactions[0].id)
        .set('Authorization', 'Bearer ' + user.jwt(application))
        .expect(403)
        .end(done);
    });

    it('fails deleting a transaction if user has no access to the group', function(done) {
      request(app)
      .delete('/groups/' + group.id + '/transactions/' + transactions[0].id)
        .set('Authorization', 'Bearer ' + user2.jwt(application))
        .expect(403)
        .end(done);
    });

    it('successfully delete a transaction', function(done) {
      request(app)
        .delete('/groups/' + group.id + '/transactions/' + transactions[0].id)
        .set('Authorization', 'Bearer ' + user.jwt(application))
        .expect(200)
        .end(function(e, res) {
          expect(e).to.not.exist;
          expect(res.body).to.have.property('success', true);

          async.parallel([
            function(cb) {
              models.Transaction.find(transactions[0].id).then(function(t) {
                expect(t).to.not.exist;
                cb();
              });
            },
            function(cb) {
              models.Activity.findAndCountAll({where: {TransactionId: transactions[0].id} }).then(function(res) {
                expect(res.count).to.equal(0);
                cb();
              });
            }
          ], done);

        });
    });

    it('successfully delete a transaction with an application', function(done) {
      request(app)
        .delete('/groups/' + group.id + '/transactions/' + transactions[0].id)
        .send({
          api_key: application2.api_key
        })
        .expect(200)
        .end(function(e, res) {
          expect(e).to.not.exist;
          expect(res.body).to.have.property('success', true);
          done();
        });
    });

  });

  /**
   * Get.
   */
  describe('#get', function() {

    // Create transactions for group1.
    beforeEach(function(done) {
      async.each(transactionsData, function(transaction, cb) {
        request(app)
          .post('/groups/' + group.id + '/transactions')
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .send({
            transaction: transaction
          })
          .expect(200)
          .end(function(e, res) {
            expect(e).to.not.exist;
            cb();
          });
      }, done);
    });

    it('fails getting transactions for a not authorized group', function(done) {
      request(app)
        .get('/groups/' + group.id + '/transactions')
        .set('Authorization', 'Bearer ' + user2.jwt(application))
        .expect(403)
        .end(done);
    });

    it('successfully get a group\'s transactions', function(done) {
      request(app)
        .get('/groups/' + group.id + '/transactions')
        .set('Authorization', 'Bearer ' + user.jwt(application))
        .expect(200)
        .end(function(e, res) {
          expect(e).to.not.exist;

          var transactions = res.body;
          expect(transactions).to.have.length(transactionsData.length);
          transactions.forEach(function(t) {
            expect(t.GroupId).to.equal(group.id);
          });
          done();

        });
    });

    describe('Pagination', function() {

      var per_page = 3;

      it('successfully get a group\'s transactions with per_page', function(done) {
        request(app)
          .get('/groups/' + group.id + '/transactions')
          .send({
            per_page: per_page,
            sort: 'id',
            direction: 'asc'
          })
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .expect(200)
          .end(function(e, res) {
            expect(e).to.not.exist;
            expect(res.body.length).to.equal(per_page);
            expect(res.body[0].id).to.equal(1);
            // Check pagination header.
            var headers = res.headers;
            expect(headers).to.have.property('link');
            expect(headers.link).to.contain('next');
            expect(headers.link).to.contain('page=2');
            expect(headers.link).to.contain('current');
            expect(headers.link).to.contain('page=1');
            expect(headers.link).to.contain('per_page=' + per_page);
            expect(headers.link).to.contain('/groups/' + group.id + '/transactions');
            var tot = transactionsData.length;
            expect(headers.link).to.contain('/groups/' + group.id + '/transactions?page=' + Math.ceil(tot/per_page) + '&per_page=' + per_page + '>; rel="last"');

            done();
          });
      });

      it('successfully get the second page of a group\'s transactions', function(done) {
        var page = 2;
        request(app)
          .get('/groups/' + group.id + '/transactions')
          .send({
            per_page: per_page,
            page: page,
            sort: 'id',
            direction: 'asc'
          })
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .expect(200)
          .end(function(e, res) {
            expect(e).to.not.exist;
            expect(res.body.length).to.equal(per_page);
            expect(res.body[0].id).to.equal(per_page + 1);
            // Check pagination header.
            var headers = res.headers;
            expect(headers.link).to.contain('page=3');
            expect(headers.link).to.contain('page=2');
            done();
          });
      });

      it('successfully get a group\'s transactions using since_id', function(done) {
        var since_id = 5;

        request(app)
          .get('/groups/' + group.id + '/transactions')
          .send({
            since_id: since_id,
            sort: 'id',
            direction: 'asc'
          })
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .expect(200)
          .end(function(e, res) {
            expect(e).to.not.exist;
            var transactions = res.body;
            expect(transactions[0].id > since_id).to.be.true;
            var last = 0;
            _.each(transactions, function(t) {
              expect(t.id >= last).to.be.true;
            });
            // Check pagination header.
            var headers = res.headers;
            expect(headers.link).to.be.empty;
            done();
          });

      });

    });

    describe('Sorting', function() {

      it('successfully get a group\'s transactions with sorting', function(done) {
        request(app)
          .get('/groups/' + group.id + '/transactions')
          .send({
            sort: 'createdAt',
            direction: 'asc'
          })
          .set('Authorization', 'Bearer ' + user.jwt(application))
          .expect(200)
          .end(function(e, res) {
            expect(e).to.not.exist;
            var transactions = res.body;
            var last = new Date(transactions[0].createdAt);
            _.each(transactions, function(a) {
              expect((new Date(a.createdAt) >= new Date(last))).to.be.true;
              last = a.createdAt;
            });
            done();
          });
      });

    });

  });

});