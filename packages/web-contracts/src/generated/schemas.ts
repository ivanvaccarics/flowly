/* eslint-disable */
/**
 * GENERATED FILE — do not edit by hand.
 * Source: contracts/schemas/*.schema.json
 * Regenerate with: pnpm contracts:generate
 */

export const schemas = {
  "account": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/account.schema.json",
    "title": "Account",
    "description": "A financial account. Format version 1 of the Server MVP.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "formatVersion",
      "id",
      "name",
      "type",
      "defaultCurrency",
      "createdAt",
      "updatedAt"
    ],
    "properties": {
      "formatVersion": {
        "const": 1
      },
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80
      },
      "type": {
        "enum": [
          "checking",
          "savings",
          "credit-card",
          "cash",
          "wallet",
          "investment",
          "other"
        ]
      },
      "defaultCurrency": {
        "type": "string",
        "pattern": "^[A-Z]{3}$"
      },
      "institutionName": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "openingBalanceMinor": {
        "type": "integer"
      },
      "archivedAt": {
        "type": "string",
        "format": "date-time"
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "budget": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/budget.schema.json",
    "title": "Budget",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "formatVersion",
      "id",
      "name",
      "amountMinor",
      "currency",
      "period",
      "startDate",
      "rollover",
      "active",
      "createdAt",
      "updatedAt"
    ],
    "properties": {
      "formatVersion": {
        "const": 1
      },
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80
      },
      "amountMinor": {
        "type": "integer",
        "minimum": 1
      },
      "currency": {
        "type": "string",
        "pattern": "^[A-Z]{3}$"
      },
      "period": {
        "enum": [
          "weekly",
          "monthly",
          "quarterly",
          "yearly",
          "custom"
        ]
      },
      "startDate": {
        "type": "string",
        "format": "date"
      },
      "endDate": {
        "type": "string",
        "format": "date"
      },
      "accountIds": {
        "type": "array",
        "uniqueItems": true,
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "tagIds": {
        "type": "array",
        "uniqueItems": true,
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "rollover": {
        "type": "boolean"
      },
      "active": {
        "type": "boolean"
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "recurringRule": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/recurring-rule.schema.json",
    "title": "RecurringRule",
    "description": "Calendar-aware recurring transaction template. Occurrence generation is delivered in Phase 7.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "formatVersion",
      "id",
      "name",
      "template",
      "frequency",
      "interval",
      "startDate",
      "active",
      "createdAt",
      "updatedAt"
    ],
    "properties": {
      "formatVersion": {
        "const": 1
      },
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80
      },
      "template": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "accountId",
          "amountMinor",
          "currency"
        ],
        "properties": {
          "accountId": {
            "type": "string",
            "format": "uuid"
          },
          "amountMinor": {
            "type": "integer"
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          },
          "payee": {
            "type": "string",
            "maxLength": 120
          },
          "userNote": {
            "type": "string",
            "maxLength": 2000
          },
          "tagIds": {
            "type": "array",
            "uniqueItems": true,
            "items": {
              "type": "string",
              "format": "uuid"
            }
          }
        }
      },
      "frequency": {
        "enum": [
          "daily",
          "weekly",
          "monthly",
          "yearly"
        ]
      },
      "interval": {
        "type": "integer",
        "minimum": 1,
        "maximum": 60
      },
      "startDate": {
        "type": "string",
        "format": "date"
      },
      "endDate": {
        "type": "string",
        "format": "date"
      },
      "nextDueDate": {
        "type": "string",
        "format": "date"
      },
      "active": {
        "type": "boolean"
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "tag": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/tag.schema.json",
    "title": "Tag",
    "description": "Tags match case-insensitively; `name` preserves the casing the user typed.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "formatVersion",
      "id",
      "name",
      "normalizedName",
      "createdAt",
      "updatedAt"
    ],
    "properties": {
      "formatVersion": {
        "const": 1
      },
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 40
      },
      "normalizedName": {
        "type": "string",
        "minLength": 1,
        "maxLength": 40
      },
      "color": {
        "type": "string",
        "pattern": "^#[0-9a-fA-F]{6}$"
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "taggingRule": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/tagging-rule.schema.json",
    "title": "TaggingRule",
    "description": "User-authored rule that adds tags to matching transactions. Conditions in one rule join with a single AND or OR. Amount conditions must also carry a `currency`, which the domain validator enforces.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "formatVersion",
      "id",
      "name",
      "enabled",
      "combinator",
      "conditions",
      "tagIds",
      "createdAt",
      "updatedAt"
    ],
    "properties": {
      "formatVersion": {
        "const": 1
      },
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80
      },
      "enabled": {
        "type": "boolean"
      },
      "combinator": {
        "enum": [
          "and",
          "or"
        ]
      },
      "conditions": {
        "type": "array",
        "minItems": 1,
        "maxItems": 25,
        "items": {
          "$ref": "#/$defs/condition"
        }
      },
      "tagIds": {
        "type": "array",
        "minItems": 1,
        "maxItems": 25,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
        "type": "string",
        "format": "date-time"
      }
    },
    "$defs": {
      "condition": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "field",
          "operator",
          "value"
        ],
        "properties": {
          "field": {
            "enum": [
              "userNote",
              "description",
              "payee",
              "amountMinor",
              "accountId"
            ]
          },
          "operator": {
            "enum": [
              "contains",
              "is",
              "greaterThan",
              "lessThan",
              "equals"
            ]
          },
          "value": {
            "type": [
              "string",
              "number"
            ]
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          }
        },
        "oneOf": [
          {
            "properties": {
              "field": {
                "const": "userNote"
              },
              "operator": {
                "const": "contains"
              },
              "value": {
                "type": "string"
              }
            }
          },
          {
            "properties": {
              "field": {
                "const": "description"
              },
              "operator": {
                "const": "contains"
              },
              "value": {
                "type": "string"
              }
            }
          },
          {
            "properties": {
              "field": {
                "const": "payee"
              },
              "operator": {
                "enum": [
                  "is",
                  "contains"
                ]
              },
              "value": {
                "type": "string"
              }
            }
          },
          {
            "properties": {
              "field": {
                "const": "amountMinor"
              },
              "operator": {
                "enum": [
                  "greaterThan",
                  "lessThan",
                  "equals"
                ]
              },
              "value": {
                "type": "number"
              },
              "currency": {
                "type": "string",
                "pattern": "^[A-Z]{3}$"
              }
            },
            "required": [
              "currency"
            ]
          },
          {
            "properties": {
              "field": {
                "const": "accountId"
              },
              "operator": {
                "const": "is"
              },
              "value": {
                "type": "string",
                "format": "uuid"
              }
            }
          }
        ]
      }
    }
  },
  "transaction": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/transaction.schema.json",
    "title": "Transaction",
    "description": "A transaction. `amountMinor` is signed: inflows positive, outflows negative.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "formatVersion",
      "id",
      "accountId",
      "bookingDate",
      "amountMinor",
      "currency",
      "status",
      "source",
      "tagIds",
      "createdAt",
      "updatedAt"
    ],
    "properties": {
      "formatVersion": {
        "const": 1
      },
      "id": {
        "type": "string",
        "format": "uuid"
      },
      "accountId": {
        "type": "string",
        "format": "uuid"
      },
      "bookingDate": {
        "type": "string",
        "format": "date"
      },
      "valueDate": {
        "type": "string",
        "format": "date"
      },
      "amountMinor": {
        "type": "integer"
      },
      "currency": {
        "type": "string",
        "pattern": "^[A-Z]{3}$"
      },
      "originalAmountMinor": {
        "type": "integer"
      },
      "originalCurrency": {
        "type": "string",
        "pattern": "^[A-Z]{3}$"
      },
      "payee": {
        "type": "string",
        "maxLength": 120
      },
      "description": {
        "type": "string",
        "maxLength": 500
      },
      "userNote": {
        "type": "string",
        "maxLength": 2000
      },
      "status": {
        "enum": [
          "pending",
          "booked"
        ]
      },
      "source": {
        "enum": [
          "manual",
          "csv-import",
          "recurring-rule",
          "enable-banking"
        ]
      },
      "tagIds": {
        "type": "array",
        "maxItems": 100,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "format": "uuid"
        }
      },
      "provider": {
        "type": "string",
        "maxLength": 60
      },
      "providerAccountId": {
        "type": "string",
        "maxLength": 200
      },
      "providerTransactionId": {
        "type": "string",
        "maxLength": 200
      },
      "importFingerprint": {
        "type": "string",
        "pattern": "^[0-9a-f]{32}$"
      },
      "recurringRuleId": {
        "type": "string",
        "format": "uuid"
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
        "type": "string",
        "format": "date-time"
      }
    }
  },
  "vaultStatus": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/vault-status.schema.json",
    "title": "VaultStatus",
    "description": "What the web UI knows about the vault before it is unlocked. It never carries keys, passphrases or financial data.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "state",
      "vaultFormatVersion",
      "exportFormatVersion"
    ],
    "properties": {
      "state": {
        "enum": [
          "locked",
          "unlocked"
        ]
      },
      "vaultFormatVersion": {
        "type": "integer",
        "minimum": 1
      },
      "exportFormatVersion": {
        "type": "integer",
        "minimum": 1
      },
      "storageEngine": {
        "enum": [
          "sqlcipher",
          "record-encryption",
          null
        ]
      },
      "schemaVersion": {
        "type": [
          "integer",
          "null"
        ],
        "minimum": 0
      },
      "lastUnlockedAt": {
        "type": [
          "string",
          "null"
        ],
        "format": "date-time"
      }
    }
  }
} as const;

export const schemaIndex = [
  {
    "key": "account",
    "title": "Account",
    "id": "https://flowly.local/contracts/schemas/account.schema.json"
  },
  {
    "key": "budget",
    "title": "Budget",
    "id": "https://flowly.local/contracts/schemas/budget.schema.json"
  },
  {
    "key": "recurringRule",
    "title": "RecurringRule",
    "id": "https://flowly.local/contracts/schemas/recurring-rule.schema.json"
  },
  {
    "key": "tag",
    "title": "Tag",
    "id": "https://flowly.local/contracts/schemas/tag.schema.json"
  },
  {
    "key": "taggingRule",
    "title": "TaggingRule",
    "id": "https://flowly.local/contracts/schemas/tagging-rule.schema.json"
  },
  {
    "key": "transaction",
    "title": "Transaction",
    "id": "https://flowly.local/contracts/schemas/transaction.schema.json"
  },
  {
    "key": "vaultStatus",
    "title": "VaultStatus",
    "id": "https://flowly.local/contracts/schemas/vault-status.schema.json"
  }
] as const;

export type ContractKey = keyof typeof schemas;
