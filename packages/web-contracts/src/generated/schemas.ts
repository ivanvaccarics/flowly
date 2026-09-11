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
      "revision",
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
      "revision": {
        "type": "integer",
        "minimum": 1
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
  "archiveManifest": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/archive-manifest.schema.json",
    "title": "ArchiveManifest",
    "description": "Checksum manifest of a complete portable archive (export format version 1).",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "formatVersion",
      "createdAt",
      "vaultId",
      "entries"
    ],
    "properties": {
      "formatVersion": {
        "const": 1
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "vaultId": {
        "type": "string",
        "format": "uuid"
      },
      "entries": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "name",
            "bytes",
            "sha256"
          ],
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 80
            },
            "bytes": {
              "type": "integer",
              "minimum": 0
            },
            "sha256": {
              "type": "string",
              "pattern": "^[0-9a-f]{64}$"
            }
          }
        }
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
      "revision",
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
      "revision": {
        "type": "integer",
        "minimum": 1
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
  "dashboard": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/dashboard.schema.json",
    "title": "Dashboard",
    "description": "Dashboard view computed from the vault. Totals always carry a currency code and never blend currencies.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "range",
      "generatedAt",
      "balances",
      "cashFlow",
      "spendingByTag",
      "budgets"
    ],
    "properties": {
      "range": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "from",
          "to"
        ],
        "properties": {
          "from": {
            "type": "string",
            "format": "date"
          },
          "to": {
            "type": "string",
            "format": "date"
          }
        }
      },
      "generatedAt": {
        "type": "string",
        "format": "date-time"
      },
      "balances": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "accountId",
            "accountName",
            "currency",
            "balanceMinor",
            "isDefaultCurrency",
            "transactionCount"
          ],
          "properties": {
            "accountId": {
              "type": "string",
              "format": "uuid"
            },
            "accountName": {
              "type": "string"
            },
            "currency": {
              "type": "string",
              "pattern": "^[A-Z]{3}$"
            },
            "balanceMinor": {
              "type": "integer"
            },
            "isDefaultCurrency": {
              "type": "boolean"
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "cashFlow": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "currency",
            "incomeMinor",
            "expensesMinor",
            "netMinor",
            "transactionCount"
          ],
          "properties": {
            "currency": {
              "type": "string",
              "pattern": "^[A-Z]{3}$"
            },
            "incomeMinor": {
              "type": "integer"
            },
            "expensesMinor": {
              "type": "integer"
            },
            "netMinor": {
              "type": "integer"
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "spendingByTag": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "tagId",
            "tagName",
            "currency",
            "spentMinor",
            "transactionCount"
          ],
          "properties": {
            "tagId": {
              "type": "string",
              "format": "uuid"
            },
            "tagName": {
              "type": "string"
            },
            "currency": {
              "type": "string",
              "pattern": "^[A-Z]{3}$"
            },
            "spentMinor": {
              "type": "integer"
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "budgets": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "budgetId",
            "name",
            "currency",
            "period",
            "periodStart",
            "periodEnd",
            "limitMinor",
            "rolloverCarryMinor",
            "spentMinor",
            "remainingMinor",
            "percentUsed",
            "status",
            "skippedOtherCurrencies"
          ],
          "properties": {
            "budgetId": {
              "type": "string",
              "format": "uuid"
            },
            "name": {
              "type": "string"
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
            "periodStart": {
              "type": "string",
              "format": "date"
            },
            "periodEnd": {
              "type": "string",
              "format": "date"
            },
            "limitMinor": {
              "type": "integer"
            },
            "rolloverCarryMinor": {
              "type": "integer"
            },
            "spentMinor": {
              "type": "integer"
            },
            "remainingMinor": {
              "type": "integer"
            },
            "percentUsed": {
              "type": "number",
              "minimum": 0
            },
            "status": {
              "enum": [
                "on-track",
                "warning",
                "over"
              ]
            },
            "skippedOtherCurrencies": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
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
      "revision",
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
      "revision": {
        "type": "integer",
        "minimum": 1
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
      "revision",
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
      "revision": {
        "type": "integer",
        "minimum": 1
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
      "revision",
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
      "revision": {
        "type": "integer",
        "minimum": 1
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
      "revision",
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
      "revision": {
        "type": "integer",
        "minimum": 1
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
    "key": "archiveManifest",
    "title": "ArchiveManifest",
    "id": "https://flowly.local/contracts/schemas/archive-manifest.schema.json"
  },
  {
    "key": "budget",
    "title": "Budget",
    "id": "https://flowly.local/contracts/schemas/budget.schema.json"
  },
  {
    "key": "dashboard",
    "title": "Dashboard",
    "id": "https://flowly.local/contracts/schemas/dashboard.schema.json"
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
