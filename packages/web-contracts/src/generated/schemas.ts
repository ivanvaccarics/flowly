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
  "dashboard": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/dashboard.schema.json",
    "title": "Dashboard",
    "description": "Dashboard view computed from the vault. Totals always carry a currency code and never blend currencies. A caller may narrow it with `months=YYYY-MM,…` and `tags=<id>,<id>`: the flows, the buckets and the recent movements then cover exactly those months and those tags, while `balances` stays the account balances and `spendingByTag` keeps describing every tag in the period, so one the reader switched off can be switched back on.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "range",
      "generatedAt",
      "balances",
      "cashFlow",
      "cashFlowBuckets",
      "spendingByTag"
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
      "cashFlowBuckets": {
        "description": "Income and expenses split into calendar buckets — one month per selected month when the caller scoped the dashboard by months, one week otherwise — so the dashboard charts the period without blending currencies.",
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "currency",
            "label",
            "from",
            "to",
            "incomeMinor",
            "expensesMinor"
          ],
          "properties": {
            "currency": {
              "type": "string",
              "pattern": "^[A-Z]{3}$"
            },
            "label": {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            },
            "from": {
              "type": "string",
              "format": "date"
            },
            "to": {
              "type": "string",
              "format": "date"
            },
            "incomeMinor": {
              "type": "integer"
            },
            "expensesMinor": {
              "type": "integer"
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
      }
    }
  },
  "expenseDetails": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://flowly.local/contracts/schemas/expense-details.schema.json",
    "title": "ExpenseDetails",
    "description": "The expense detail view computed from the vault for one period. Like the dashboard it is scoped by `months=YYYY-MM,…` and never blends currencies: `currency` is the one the period leans on most, every amount below is in its minor units, and the currencies left out are named in `otherCurrencies`. A caller that asks for no month set gets the contiguous `from`/`to` range instead, and `daily[].selected` is then true for every day.",
    "type": "object",
    "additionalProperties": false,
    "required": [
      "range",
      "generatedAt",
      "currency",
      "otherCurrencies",
      "totals",
      "byCategory",
      "untagged",
      "daily",
      "weekly",
      "byAccount",
      "bySource",
      "amountBands"
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
      "currency": {
        "description": "The currency the period spends most in, or null when the period holds no booked outflow at all.",
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[A-Z]{3}$"
      },
      "otherCurrencies": {
        "description": "Currencies that also carry booked outflows in the period and are therefore left out of every figure below.",
        "type": "array",
        "items": {
          "type": "string",
          "pattern": "^[A-Z]{3}$"
        }
      },
      "totals": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "spentMinor",
          "incomeMinor",
          "netMinor",
          "transactionCount",
          "calendarDays",
          "activeDays",
          "averageDailyMinor",
          "averageActiveDayMinor",
          "averageTicketMinor",
          "largestMinor",
          "largestDate",
          "largestPayee"
        ],
        "properties": {
          "spentMinor": {
            "type": "integer",
            "minimum": 0
          },
          "incomeMinor": {
            "type": "integer",
            "minimum": 0
          },
          "netMinor": {
            "type": "integer"
          },
          "transactionCount": {
            "type": "integer",
            "minimum": 0
          },
          "calendarDays": {
            "type": "integer",
            "minimum": 0
          },
          "activeDays": {
            "type": "integer",
            "minimum": 0
          },
          "averageDailyMinor": {
            "type": "integer",
            "minimum": 0
          },
          "averageActiveDayMinor": {
            "type": "integer",
            "minimum": 0
          },
          "averageTicketMinor": {
            "type": "integer",
            "minimum": 0
          },
          "largestMinor": {
            "type": "integer",
            "minimum": 0
          },
          "largestDate": {
            "type": [
              "string",
              "null"
            ],
            "format": "date"
          },
          "largestPayee": {
            "type": [
              "string",
              "null"
            ]
          }
        }
      },
      "byCategory": {
        "description": "Booked outflows grouped by tag. A movement that carries several tags counts in full under each of them, exactly as the dashboard's spending breakdown does.",
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "tagId",
            "tagName",
            "spentMinor",
            "transactionCount",
            "averageMinor",
            "largestMinor"
          ],
          "properties": {
            "tagId": {
              "type": "string",
              "format": "uuid"
            },
            "tagName": {
              "type": "string"
            },
            "spentMinor": {
              "type": "integer",
              "minimum": 0
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            },
            "averageMinor": {
              "type": "integer",
              "minimum": 0
            },
            "largestMinor": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "untagged": {
        "description": "Booked outflows of the period that carry no tag at all.",
        "type": "object",
        "additionalProperties": false,
        "required": [
          "spentMinor",
          "transactionCount"
        ],
        "properties": {
          "spentMinor": {
            "type": "integer",
            "minimum": 0
          },
          "transactionCount": {
            "type": "integer",
            "minimum": 0
          }
        }
      },
      "daily": {
        "description": "One entry per calendar day of the range, so the heatmap and the cumulative chart keep a continuous axis. `selected` is false for a day whose month the caller left out of a scattered month set, and such a day never carries a figure.",
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "date",
            "selected",
            "spentMinor",
            "transactionCount"
          ],
          "properties": {
            "date": {
              "type": "string",
              "format": "date"
            },
            "selected": {
              "type": "boolean"
            },
            "spentMinor": {
              "type": "integer",
              "minimum": 0
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "weekly": {
        "description": "Booked outflows per seven-day slice of the range, empty slices included, so the bars keep a continuous axis.",
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "label",
            "from",
            "to",
            "spentMinor",
            "transactionCount"
          ],
          "properties": {
            "label": {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            },
            "from": {
              "type": "string",
              "format": "date"
            },
            "to": {
              "type": "string",
              "format": "date"
            },
            "spentMinor": {
              "type": "integer",
              "minimum": 0
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "byAccount": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "accountId",
            "accountName",
            "spentMinor",
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
            "spentMinor": {
              "type": "integer",
              "minimum": 0
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "bySource": {
        "description": "Booked outflows by where the row came from: typed by hand, imported from a file, or read from the bank.",
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "source",
            "spentMinor",
            "transactionCount"
          ],
          "properties": {
            "source": {
              "type": "string",
              "enum": [
                "manual",
                "csv-import",
                "enable-banking"
              ]
            },
            "spentMinor": {
              "type": "integer",
              "minimum": 0
            },
            "transactionCount": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
      },
      "amountBands": {
        "description": "Booked outflows bucketed by their absolute amount. The thresholds are 10, 50, 150 and 500 major units scaled to the currency's own minor units, so a JPY vault bands on whole yen.",
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "key",
            "label",
            "lowerMinor",
            "upperMinor",
            "count",
            "spentMinor"
          ],
          "properties": {
            "key": {
              "type": "string",
              "enum": [
                "under-10",
                "10-50",
                "50-150",
                "150-500",
                "over-500"
              ]
            },
            "label": {
              "type": "string",
              "minLength": 1,
              "maxLength": 40
            },
            "lowerMinor": {
              "type": "integer",
              "minimum": 0
            },
            "upperMinor": {
              "type": [
                "integer",
                "null"
              ],
              "minimum": 0
            },
            "count": {
              "type": "integer",
              "minimum": 0
            },
            "spentMinor": {
              "type": "integer",
              "minimum": 0
            }
          }
        }
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
    "description": "User-authored rule that adds tags to matching transactions. Conditions in one rule join with a single AND or OR. An `amount` condition carries a canonical decimal string in its own `currency` (`-5.10` means an outflow of 5.10), not a count of minor units, and only matches transactions in that currency.",
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
        "const": 2
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
              "amount",
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
                "const": "amount"
              },
              "operator": {
                "enum": [
                  "greaterThan",
                  "lessThan",
                  "equals"
                ]
              },
              "value": {
                "type": "string",
                "pattern": "^-?[0-9]+(\\.[0-9]+)?$"
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
    "description": "A transaction. `amountMinor` is signed: inflows positive, outflows negative. `counterpartyIban` is the account on the other side when the bank names it, compacted and uppercased. `transfer` marks a movement that only moves money between the user's own accounts: absent means undecided, a boolean is the user's decision, and `true` keeps the row out of income, expenses and spending.",
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
      "transfer": {
        "type": "boolean"
      },
      "counterpartyIban": {
        "type": "string",
        "pattern": "^[A-Z]{2}[0-9A-Z]{11,32}$",
        "description": "The account on the other side of the movement, compacted and uppercased, when the bank prints it on its own leg. It is what lets transfer pairing compare against the user's own accounts instead of reading the payee."
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
      "vaultExists",
      "vaultId",
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
      "vaultExists": {
        "type": "boolean",
        "description": "False on a fresh deployment, so the client can offer to create the vault."
      },
      "vaultId": {
        "type": [
          "string",
          "null"
        ],
        "format": "uuid",
        "description": "Public vault identifier shown in the UI; null when no vault exists yet."
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
    "key": "dashboard",
    "title": "Dashboard",
    "id": "https://flowly.local/contracts/schemas/dashboard.schema.json"
  },
  {
    "key": "expenseDetails",
    "title": "ExpenseDetails",
    "id": "https://flowly.local/contracts/schemas/expense-details.schema.json"
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
