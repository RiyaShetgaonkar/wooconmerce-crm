-- =====================================================================
-- WooCommerce CRM — Database Schema
-- Target: MySQL 8.0+ (InnoDB, utf8mb4)
-- Usage:  mysql -u root -p < backend/database/schema.sql
--    or:  npm run db:init
-- =====================================================================

CREATE DATABASE IF NOT EXISTS woocommerce_crm
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE woocommerce_crm;

-- ---------------------------------------------------------------------
-- customers
-- One row per WooCommerce customer. Guest checkouts (WC customer id = 0)
-- are stored with wc_customer_id = NULL and matched by email instead.
-- total_spent / order_count / segment are denormalized for fast
-- dashboard queries and recalculated after each order sync.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id               INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  wc_customer_id   BIGINT UNSIGNED  NULL,
  first_name       VARCHAR(100)     NOT NULL DEFAULT '',
  last_name        VARCHAR(100)     NOT NULL DEFAULT '',
  email            VARCHAR(255)     NOT NULL,
  phone            VARCHAR(50)      NULL,
  total_spent      DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  order_count      INT UNSIGNED     NOT NULL DEFAULT 0,
  segment          ENUM('New','Repeat','High-Value') NOT NULL DEFAULT 'New',
  last_order_date  DATETIME         NULL,
  created_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_wc_customer_id (wc_customer_id),  -- multiple NULLs allowed
  UNIQUE KEY uq_customers_email (email),
  KEY idx_customers_segment (segment),
  KEY idx_customers_total_spent (total_spent),
  KEY idx_customers_name (last_name, first_name)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- orders
-- Synced WooCommerce orders. wc_order_id is unique so sync can use
-- INSERT ... ON DUPLICATE KEY UPDATE (idempotent re-syncs).
-- status is VARCHAR because WooCommerce allows custom statuses.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  wc_order_id    BIGINT UNSIGNED  NOT NULL,
  customer_id    INT UNSIGNED     NOT NULL,
  total          DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  currency       CHAR(3)          NOT NULL DEFAULT 'USD',
  status         VARCHAR(30)      NOT NULL DEFAULT 'pending',
  date_created   DATETIME         NOT NULL,
  created_at     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_wc_order_id (wc_order_id),
  KEY idx_orders_customer_date (customer_id, date_created),
  KEY idx_orders_status (status),
  KEY idx_orders_date_created (date_created),

  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- order_items
-- Products in each order (WooCommerce line_items). Replaced on every
-- sync of the order, so no unique key on wc_item_id is needed.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  order_id       INT UNSIGNED     NOT NULL,
  wc_item_id     BIGINT UNSIGNED  NULL,
  wc_product_id  BIGINT UNSIGNED  NULL,
  product_name   VARCHAR(255)     NOT NULL,
  sku            VARCHAR(100)     NULL,
  quantity       INT UNSIGNED     NOT NULL DEFAULT 1,
  total          DECIMAL(12,2)    NOT NULL DEFAULT 0.00,

  PRIMARY KEY (id),
  KEY idx_items_order (order_id),
  KEY idx_items_product (wc_product_id),

  CONSTRAINT fk_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- interaction_notes
-- Free-form notes a store owner records against a customer.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS interaction_notes (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_id   INT UNSIGNED  NOT NULL,
  note_type     ENUM('note','call','email','meeting','other') NOT NULL DEFAULT 'note',
  content       TEXT          NOT NULL,
  created_by    VARCHAR(100)  NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_notes_customer_created (customer_id, created_at),

  CONSTRAINT fk_notes_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- follow_up_tasks
-- Reminders / to-dos scheduled against a customer.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  customer_id   INT UNSIGNED  NOT NULL,
  title         VARCHAR(255)  NOT NULL,
  description   TEXT          NULL,
  due_date      DATETIME      NOT NULL,
  priority      ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status        ENUM('pending','completed','cancelled') NOT NULL DEFAULT 'pending',
  completed_at  DATETIME      NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_tasks_customer (customer_id),
  KEY idx_tasks_status_due (status, due_date),   -- "upcoming / overdue" queries

  CONSTRAINT fk_tasks_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;