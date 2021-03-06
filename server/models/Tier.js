import Promise from 'bluebird';
import _ from 'lodash';
import { capitalize, pluralize } from '../lib/utils';
import debugLib from 'debug';
const debug = debugLib('tier');
import CustomDataTypes from './DataTypes';

export default function(Sequelize, DataTypes) {

  const { models } = Sequelize;

  const Tier = Sequelize.define('Tier', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    CollectiveId: {
      type: DataTypes.INTEGER,
      references: {
        model: 'Collectives',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    },

    // human readable way to uniquely access a tier for a given collective or collective/event combo
    slug: {
      type: DataTypes.STRING,
      set(slug) {
        if (slug && slug.toLowerCase) {
          this.setDataValue('slug', slug.toLowerCase().replace(/ /g, '-'));
        }
      }
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
      set(name) {
        if (!this.getDataValue('slug')) {
          this.slug = name;
        }
        this.setDataValue('name', name);
      }
    },

    type: {
      type: DataTypes.STRING, // TIER, TICKET
      defaultValue: 'TIER'
    },

    description: DataTypes.STRING,
    button: DataTypes.STRING,

    amount: {
      type: DataTypes.INTEGER, // In cents
      min: 0
    },

    presets: {
      type: DataTypes.ARRAY(DataTypes.INTEGER)
    },
  
    currency: CustomDataTypes(DataTypes).currency,

    interval: {
      type: DataTypes.STRING(8),
      validate: {
        isIn: {
          args: [['month', 'year']],
          msg: 'Must be month or year'
        }
      }
    },

    // Max quantity of tickets to sell (0 for unlimited)
    maxQuantity: {
      type: DataTypes.INTEGER,
      min: 0
    },

    // Max quantity of tickets per user (0 for unlimited)
    maxQuantityPerUser: {
      type: DataTypes.INTEGER,
      min: 0
    },

    // Goal to reach
    goal: {
      type: DataTypes.INTEGER,
      min: 0
    },

    password: {
      type: DataTypes.STRING
    },

    startsAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.NOW
    },

    endsAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.NOW
    },

    createdAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.NOW
    },

    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: Sequelize.NOW
    },

    deletedAt: {
      type: DataTypes.DATE
    }
  }, {
    paranoid: true,

    getterMethods: {
      info() {
        return {
          id: this.id,
          name: this.name,
          description: this.description,
          amount: this.amount,
          currency: this.currency,
          maxQuantity: this.maxQuantity,
          startsAt: this.startsAt,
          endsAt: this.endsAt,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt
        }
      },

      title() {
        return capitalize(pluralize(this.name));
      }
    }
  });

  /**
   * Instance Methods
   */

   // TODO: Check for maxQuantityPerUser
  Tier.prototype.availableQuantity = function() {
    return models.Order.sum('quantity', { 
        where: {
          TierId: this.id,
          processedAt: { $ne: null }
        }
      })
      .then(usedQuantity => {
        debug("availableQuantity", "usedQuantity:", usedQuantity, "maxQuantity", this.maxQuantity);
        if (this.maxQuantity && usedQuantity) {
          return this.maxQuantity - usedQuantity;
        } else if (this.maxQuantity) {
          return this.maxQuantity;
        } else {
          return Infinity;
        }
      })
  };

  Tier.prototype.checkAvailableQuantity = function(quantityNeeded = 1) {
    return this.availableQuantity()
    .then(available => (available - quantityNeeded >= 0))
  };

  /**
   * Class Methods
   */
  Tier.createMany = (tiers, defaultValues = {}) => {
    return Promise.map(tiers, t => Tier.create(_.defaults({}, t, defaultValues)), {concurrency: 1});
  };

  /**
   * Append tier to each backer in an array of backers
   */
  Tier.appendTier = (collective, backerCollectives) => {
    const backerCollectivesIds = backerCollectives.map(b => b.id);
    debug("appendTier", collective.name, "backers: ", backerCollectives.length);
    return models.Member.findAll({
      where: {
        MemberCollectiveId: { $in: backerCollectivesIds },
        CollectiveId: collective.id
      },
      include: [ { model: models.Tier }]
    })
    .then(memberships => {
      const membershipsForBackerCollective = {};
      memberships.map(m => {
        membershipsForBackerCollective[m.MemberCollectiveId] = m.Tier;
      })
      return backerCollectives.map(backerCollective => {
        backerCollective.tier = membershipsForBackerCollective[backerCollective.id];
        debug("appendTier for", backerCollective.name,":", backerCollective.tier && backerCollective.tier.slug);
        return backerCollective;
      })
    });
  }

  return Tier;
}
