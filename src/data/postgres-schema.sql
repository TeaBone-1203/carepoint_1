-- =========================================================
-- CarePoint — "The Neighborhood Apothecary"
-- Relational schema reverse-engineered from the app's
-- in-memory `DB` object (single-file prototype build).
-- Target: PostgreSQL 13+
-- =========================================================

-- ---------- Extensions ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid(), if you later swap string ids for UUIDs

-- ---------- Reset (safe to re-run this whole script) ----------
DROP TABLE IF EXISTS
    notif_templates, notification_log, notifications,
    flags, faqs, promotions, homepage_banner, audit_log, settings, pages,
    returns, reviews,
    thread_messages, threads,
    order_items, orders,
    customer_wishlist, medicines,
    customer_addresses, customers,
    staff, admins, pharmacies
CASCADE;

DROP TYPE IF EXISTS
    pharmacy_status, account_status, fulfillment_type, order_status,
    thread_type, thread_status, message_sender, return_status, return_source,
    notif_type, notif_kind, flag_target_type, flag_status
CASCADE;

-- ---------- Enum types ----------
CREATE TYPE pharmacy_status   AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE account_status    AS ENUM ('pending', 'active', 'disabled');
CREATE TYPE fulfillment_type  AS ENUM ('pickup', 'delivery');
CREATE TYPE order_status      AS ENUM ('pending', 'confirmed', 'ready', 'completed', 'cancelled');
CREATE TYPE thread_type       AS ENUM ('order', 'prescription');
CREATE TYPE thread_status     AS ENUM ('open', 'closed');
CREATE TYPE message_sender    AS ENUM ('customer', 'staff');
CREATE TYPE return_status     AS ENUM ('requested', 'approved', 'rejected', 'refunded');
CREATE TYPE return_source     AS ENUM ('customer', 'staff');
CREATE TYPE notif_type        AS ENUM ('order', 'message', 'promo');
CREATE TYPE notif_kind        AS ENUM ('automated', 'manual');
CREATE TYPE flag_target_type  AS ENUM ('customer', 'staff');
CREATE TYPE flag_status       AS ENUM ('open', 'resolved');

-- =========================================================
-- Core entities
-- =========================================================

CREATE TABLE pharmacies (
    id          VARCHAR(20)     PRIMARY KEY,
    name        VARCHAR(150)    NOT NULL,
    location    VARCHAR(255),
    hours       VARCHAR(150),
    status      pharmacy_status NOT NULL DEFAULT 'pending',
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION
);

CREATE TABLE admins (
    id          VARCHAR(20)   PRIMARY KEY,
    name        VARCHAR(150)  NOT NULL,
    email       VARCHAR(255)  NOT NULL UNIQUE,
    password    VARCHAR(255)  NOT NULL   -- plaintext in the prototype; hash in production
);

CREATE TABLE staff (
    id          VARCHAR(20)     PRIMARY KEY,
    name        VARCHAR(150)    NOT NULL,
    email       VARCHAR(255)    NOT NULL UNIQUE,
    password    VARCHAR(255)    NOT NULL,
    pharmacy_id VARCHAR(20)     NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    status      account_status  NOT NULL DEFAULT 'pending',
    is_owner    BOOLEAN         NOT NULL DEFAULT FALSE
);

CREATE TABLE customers (
    id          VARCHAR(20)     PRIMARY KEY,
    name        VARCHAR(150)    NOT NULL,
    email       VARCHAR(255)    NOT NULL UNIQUE,
    password    VARCHAR(255)    NOT NULL,
    status      account_status  NOT NULL DEFAULT 'active'
);

CREATE TABLE customer_addresses (
    id          VARCHAR(20)   PRIMARY KEY,
    customer_id VARCHAR(20)   NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    label       VARCHAR(100)  NOT NULL,
    text        VARCHAR(255)  NOT NULL
);

CREATE TABLE customer_wishlist (
    customer_id VARCHAR(20) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    med_id      VARCHAR(20) NOT NULL,   -- FK to medicines added after that table exists (see ALTER below)
    PRIMARY KEY (customer_id, med_id)
);

CREATE TABLE medicines (
    id                    VARCHAR(20)     PRIMARY KEY,
    pharmacy_id           VARCHAR(20)     NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    name                  VARCHAR(200)    NOT NULL,
    brand                 VARCHAR(150),
    category              VARCHAR(100)    NOT NULL,
    price                 NUMERIC(10,2)   NOT NULL CHECK (price >= 0),
    stock                 INTEGER         NOT NULL DEFAULT 0 CHECK (stock >= 0),
    prescription          BOOLEAN         NOT NULL DEFAULT FALSE,
    sold                  INTEGER         NOT NULL DEFAULT 0,
    added_at              INTEGER         NOT NULL DEFAULT 0,   -- sort ordinal used by the app, not a timestamp
    status                VARCHAR(20)     DEFAULT 'active',
    low_stock_threshold   INTEGER,
    description           TEXT,
    specs                 JSONB,          -- free-form key/value spec sheet (Form, Strength, Manufacturer, ...)
    images                JSONB           -- array of image URLs / data-URIs
);

ALTER TABLE customer_wishlist
    ADD CONSTRAINT fk_wishlist_medicine FOREIGN KEY (med_id) REFERENCES medicines(id) ON DELETE CASCADE;

-- =========================================================
-- Orders
-- =========================================================

CREATE TABLE orders (
    id              VARCHAR(20)      PRIMARY KEY,
    customer_id     VARCHAR(20)      NOT NULL REFERENCES customers(id),
    pharmacy_id     VARCHAR(20)      NOT NULL REFERENCES pharmacies(id),
    fulfillment     fulfillment_type NOT NULL DEFAULT 'pickup',
    address_id      VARCHAR(20)      REFERENCES customer_addresses(id),
    status          order_status     NOT NULL DEFAULT 'pending',
    payment_method  VARCHAR(20),           -- card | paypal | gcash | paymaya | cod
    payment_label   VARCHAR(50),
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    order_id    VARCHAR(20)     NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    med_id      VARCHAR(20)     NOT NULL REFERENCES medicines(id),
    qty         INTEGER         NOT NULL CHECK (qty > 0),
    price       NUMERIC(10,2)   NOT NULL,   -- price at time of purchase (snapshot)
    PRIMARY KEY (order_id, med_id)
);

-- =========================================================
-- Messaging (support threads)
-- =========================================================

CREATE TABLE threads (
    id                    VARCHAR(20)    PRIMARY KEY,
    pharmacy_id           VARCHAR(20)    NOT NULL REFERENCES pharmacies(id),
    customer_id           VARCHAR(20)    NOT NULL REFERENCES customers(id),
    type                  thread_type    NOT NULL,
    order_id              VARCHAR(20)    REFERENCES orders(id),      -- set when type = 'order'
    med_id                VARCHAR(20)    REFERENCES medicines(id),   -- set when type = 'prescription'
    subject               VARCHAR(255)   NOT NULL,
    status                thread_status  NOT NULL DEFAULT 'open',
    unread_for_customer   BOOLEAN        NOT NULL DEFAULT FALSE,
    unread_for_staff      BOOLEAN        NOT NULL DEFAULT FALSE
);

CREATE TABLE thread_messages (
    id          BIGSERIAL       PRIMARY KEY,
    thread_id   VARCHAR(20)     NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    from_role   message_sender  NOT NULL,
    text        TEXT,
    image       TEXT,           -- data-URI / URL of an attached Rx photo
    at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- =========================================================
-- Reviews & returns
-- =========================================================

CREATE TABLE reviews (
    id          VARCHAR(20)   PRIMARY KEY,
    med_id      VARCHAR(20)   NOT NULL REFERENCES medicines(id),
    customer_id VARCHAR(20)   NOT NULL REFERENCES customers(id),
    order_id    VARCHAR(20)   NOT NULL REFERENCES orders(id),
    rating      SMALLINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
    at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE returns (
    id              VARCHAR(20)     PRIMARY KEY,
    order_id        VARCHAR(20)     NOT NULL REFERENCES orders(id),
    customer_id     VARCHAR(20)     NOT NULL REFERENCES customers(id),
    pharmacy_id     VARCHAR(20)     NOT NULL REFERENCES pharmacies(id),
    reason          TEXT            NOT NULL,
    status          return_status   NOT NULL DEFAULT 'requested',
    refund_amount   NUMERIC(10,2),
    source          return_source   NOT NULL,   -- who opened the return
    at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- =========================================================
-- Notifications
-- =========================================================

CREATE TABLE notifications (
    id          VARCHAR(20)   PRIMARY KEY,
    customer_id VARCHAR(20)   NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    type        notif_type    NOT NULL,
    text        TEXT          NOT NULL,
    read        BOOLEAN       NOT NULL DEFAULT FALSE,
    at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE notification_log (
    id          VARCHAR(20)   PRIMARY KEY,
    pharmacy_id VARCHAR(20)   NOT NULL REFERENCES pharmacies(id),
    event       VARCHAR(50)   NOT NULL,     -- e.g. orderPlaced, orderConfirmed, returnUpdate...
    customer_id VARCHAR(20)   REFERENCES customers(id),
    text        TEXT          NOT NULL,
    kind        notif_kind    NOT NULL DEFAULT 'automated',
    at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Per-pharmacy, per-event notification template config.
CREATE TABLE notif_templates (
    pharmacy_id VARCHAR(20)   NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
    event_id    VARCHAR(50)   NOT NULL,   -- orderPlaced | orderConfirmed | orderReady | orderCompleted | orderCancelled | returnUpdate
    enabled     BOOLEAN       NOT NULL DEFAULT TRUE,
    text        TEXT          NOT NULL,
    PRIMARY KEY (pharmacy_id, event_id)
);

-- =========================================================
-- Platform-admin moderation & CMS
-- =========================================================

CREATE TABLE flags (
    id          VARCHAR(20)         PRIMARY KEY,
    target_type flag_target_type    NOT NULL,
    target_id   VARCHAR(20)         NOT NULL,   -- polymorphic: customers.id or staff.id depending on target_type
    reason      TEXT                NOT NULL,
    status      flag_status         NOT NULL DEFAULT 'open'
);

CREATE TABLE pages (
    key     VARCHAR(50)   PRIMARY KEY,   -- about | contact | privacy
    title   VARCHAR(150)  NOT NULL,
    body    TEXT          NOT NULL
);

CREATE TABLE faqs (
    id  VARCHAR(20)   PRIMARY KEY,
    q   TEXT          NOT NULL,
    a   TEXT          NOT NULL
);

CREATE TABLE promotions (
    id      VARCHAR(20)   PRIMARY KEY,
    title   VARCHAR(150)  NOT NULL,
    text    TEXT          NOT NULL,
    active  BOOLEAN       NOT NULL DEFAULT TRUE
);

-- Singleton row holding the homepage hero banner.
CREATE TABLE homepage_banner (
    id          BOOLEAN       PRIMARY KEY DEFAULT TRUE CHECK (id),  -- enforces a single row
    headline    VARCHAR(255)  NOT NULL,
    subtext     VARCHAR(255),
    cta_label   VARCHAR(100),
    active      BOOLEAN       NOT NULL DEFAULT TRUE
);

CREATE TABLE audit_log (
    id      VARCHAR(20)   PRIMARY KEY,
    at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    actor   VARCHAR(150)  NOT NULL,
    action  TEXT          NOT NULL
);

-- Singleton row holding platform-wide settings.
CREATE TABLE settings (
    id                  BOOLEAN       PRIMARY KEY DEFAULT TRUE CHECK (id),
    platform_name       VARCHAR(100)  NOT NULL DEFAULT 'CarePoint',
    support_email       VARCHAR(255),
    currency            VARCHAR(3)    NOT NULL DEFAULT 'PHP',
    pickup_enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
    delivery_enabled    BOOLEAN       NOT NULL DEFAULT TRUE,
    delivery_fee        NUMERIC(10,2) NOT NULL DEFAULT 0,
    free_delivery_over  NUMERIC(10,2),
    low_stock_threshold INTEGER       NOT NULL DEFAULT 10,
    return_window_days  INTEGER       NOT NULL DEFAULT 7,
    payments            JSONB         NOT NULL DEFAULT '{"card":true,"gcash":true,"paymaya":true,"paypal":true,"cod":true}'
);

-- =========================================================
-- Helpful indexes
-- =========================================================

CREATE INDEX idx_medicines_pharmacy      ON medicines(pharmacy_id);
CREATE INDEX idx_medicines_category      ON medicines(category);
CREATE INDEX idx_orders_customer         ON orders(customer_id);
CREATE INDEX idx_orders_pharmacy         ON orders(pharmacy_id);
CREATE INDEX idx_orders_status           ON orders(status);
CREATE INDEX idx_threads_pharmacy        ON threads(pharmacy_id);
CREATE INDEX idx_threads_customer        ON threads(customer_id);
CREATE INDEX idx_reviews_medicine        ON reviews(med_id);
CREATE INDEX idx_returns_order           ON returns(order_id);
CREATE INDEX idx_notifications_customer  ON notifications(customer_id);
CREATE INDEX idx_staff_pharmacy          ON staff(pharmacy_id);

-- =========================================================
-- Seed data (mirrors the app's built-in demo dataset)
-- =========================================================

INSERT INTO pharmacies (id, name, location, hours, status, lat, lng) VALUES
    ('p1', 'Wellness Corner Pharmacy', '12 Mabini St., Downtown District', '8:00 AM – 9:00 PM daily', 'approved', 14.5906, 120.9799),
    ('p_pending', 'Greenleaf Apothecary', '45 Sampaguita Ave., Riverside', '9:00 AM – 8:00 PM Mon–Sat', 'pending', NULL, NULL);

INSERT INTO admins (id, name, email, password) VALUES
    ('a1', 'Admin User', 'admin@carepoint.ph', 'admin123');

INSERT INTO staff (id, name, email, password, pharmacy_id, status, is_owner) VALUES
    ('s1', 'Alyssa Reyes', 'alyssa@wellnesscorner.ph', 'demo123', 'p1', 'active', TRUE),
    ('s2', 'Marco Ibarra', 'marco@wellnesscorner.ph', 'demo123', 'p1', 'active', FALSE),
    ('s_pending', 'Maria Santos', 'maria@greenleaf.ph', 'demo123', 'p_pending', 'pending', TRUE);

INSERT INTO customers (id, name, email, password, status) VALUES
    ('c1', 'Juan Dela Cruz', 'juan@example.com', 'demo123', 'active');

INSERT INTO customer_addresses (id, customer_id, label, text) VALUES
    ('addr1', 'c1', 'Home', '123 Mabini St., Downtown District');

INSERT INTO medicines (id, pharmacy_id, name, category, price, stock, prescription, sold, added_at, brand, description, specs) VALUES
    ('m1',  'p1', 'Paracetamol 500mg (20 tabs)',        'Pain Relief',  85,  120, FALSE, 34, 10, 'Unilab',
        'Fast-acting relief for headaches, fever, and everyday aches — gentle on the stomach when taken as directed.',
        '{"Form":"Tablet","Strength":"500 mg","Pack Size":"20 tablets","Manufacturer":"CarePoint Generics","Storage":"Store below 30°C, away from moisture"}'),
    ('m2',  'p1', 'Ibuprofen 200mg (20 tabs)',          'Pain Relief',  120, 60,  FALSE, 19, 9,  'Pfizer',
        'An anti-inflammatory pain reliever that eases pain, swelling, and fever — good for muscle aches and minor injuries.',
        '{"Form":"Tablet","Strength":"200 mg","Pack Size":"20 tablets","Manufacturer":"CarePoint Generics","Storage":"Store below 30°C, away from moisture"}'),
    ('m3',  'p1', 'Cetirizine 10mg (10 tabs)',          'Allergy',      95,  40,  FALSE, 12, 8,  'GSK',
        'A once-daily antihistamine for sneezing, itchy eyes, and a runny nose brought on by allergies.',
        '{"Form":"Tablet","Strength":"10 mg","Pack Size":"10 tablets","Manufacturer":"CarePoint Generics","Storage":"Store below 25°C"}'),
    ('m4',  'p1', 'Cough Syrup — Adult 120ml',          'Cold & Flu',   135, 30,  FALSE, 21, 7,  'Unilab',
        'Soothes dry and productive coughs so you can rest easier through a cold.',
        '{"Form":"Syrup","Volume":"120 ml","Dosage":"10 ml every 6–8 hours","Manufacturer":"Wellness Labs PH","Storage":"Discard 6 months after opening"}'),
    ('m5',  'p1', 'Oral Rehydration Salts (10 sachets)','Digestive',    40,  100, FALSE, 8,  6,  'RiteMed',
        'Replaces fluids and electrolytes lost from diarrhea, vomiting, or heat exhaustion.',
        '{"Form":"Powder sachet","Pack Size":"10 sachets","Preparation":"Dissolve 1 sachet in 200 ml clean water","Manufacturer":"CarePoint Generics"}'),
    ('m6',  'p1', 'Amoxicillin 500mg (21 caps)',        'Prescription', 180, 50,  TRUE,  5,  5,  'Pfizer',
        'A broad-spectrum antibiotic used to treat a range of bacterial infections. Prescription required.',
        '{"Form":"Capsule","Strength":"500 mg","Pack Size":"21 capsules","Requires Prescription":"Yes","Manufacturer":"CarePoint Pharma"}'),
    ('m7',  'p1', 'Vitamin C 500mg (60 tabs)',          'Vitamins',     150, 200, FALSE, 41, 4,  'Unilab',
        'Supports everyday immune health and skin with a daily dose of Vitamin C.',
        '{"Form":"Tablet","Strength":"500 mg","Pack Size":"60 tablets","Manufacturer":"Sunrise Nutraceuticals"}'),
    ('m8',  'p1', 'Multivitamins (60 tabs)',            'Vitamins',     220, 80,  FALSE, 27, 3,  'GSK',
        'A complete daily multivitamin covering essential vitamins and minerals for everyday energy.',
        '{"Form":"Tablet","Pack Size":"60 tablets","Dosage":"1 tablet daily with food","Manufacturer":"Sunrise Nutraceuticals"}'),
    ('m9',  'p1', 'Antiseptic Solution 250ml',          'First Aid',    75,  55,  FALSE, 6,  2,  'RiteMed',
        'A gentle antiseptic solution for cleaning minor cuts, scrapes, and grazes.',
        '{"Form":"Liquid","Volume":"250 ml","Active Ingredient":"Povidone-iodine 10%","Manufacturer":"CarePoint Generics"}'),
    ('m10', 'p1', 'Hydrocortisone Cream 1% 20g',        'Skin Care',    180, 6,   FALSE, 3,  1,  'GSK',
        'A mild topical steroid cream that calms itching, redness, and irritation.',
        '{"Form":"Cream","Strength":"1%","Volume":"20 g","Application":"Thin layer, 1–2 times daily","Manufacturer":"CarePoint Generics"}'),
    ('m11', 'p1', 'Salbutamol Inhaler 100mcg',          'Prescription', 320, 40,  TRUE,  2,  0,  'GSK',
        'A fast-acting reliever inhaler for asthma and sudden breathing difficulty. Prescription required.',
        '{"Form":"Metered-dose inhaler","Strength":"100 mcg/puff","Requires Prescription":"Yes","Manufacturer":"CarePoint Pharma"}'),
    ('m_pending1', 'p_pending', 'Echinacea Drops 30ml',        'Cold & Flu', 210, 45, FALSE, 0, 0, 'Greenleaf Botanicals',
        'An herbal tincture traditionally used to support the immune system at the first sign of a cold.',
        '{"Form":"Liquid drops","Volume":"30 ml","Manufacturer":"Greenleaf Botanicals"}'),
    ('m_pending2', 'p_pending', 'Ginger & Honey Lozenges',     'Cold & Flu', 95,  60, FALSE, 0, 0, 'Greenleaf Botanicals',
        'Soothing lozenges that ease a scratchy throat with real ginger and honey.',
        '{"Form":"Lozenge","Pack Size":"12 lozenges","Manufacturer":"Greenleaf Botanicals"}');

INSERT INTO customer_wishlist (customer_id, med_id) VALUES ('c1', 'm7');

INSERT INTO orders (id, customer_id, pharmacy_id, fulfillment, address_id, status, created_at) VALUES
    ('o1001', 'c1', 'p1', 'pickup', NULL, 'completed', now() - interval '2 days'),
    ('o1002', 'c1', 'p1', 'pickup', NULL, 'completed', now() - interval '4 days');

INSERT INTO order_items (order_id, med_id, qty, price) VALUES
    ('o1001', 'm10', 1, 180),
    ('o1002', 'm1',  2, 85);

INSERT INTO reviews (id, med_id, customer_id, order_id, rating, at) VALUES
    ('rv1', 'm10', 'c1', 'o1001', 5, now() - interval '5 days');

INSERT INTO notifications (id, customer_id, type, text, read, at) VALUES
    ('n1', 'c1', 'promo', '🌿 Welcome basket: 10% off Vitamins this week at Wellness Corner Pharmacy.', FALSE, now() - interval '3 hours');

INSERT INTO pages (key, title, body) VALUES
    ('about',   'About Us', 'CarePoint connects neighborhood pharmacies with the customers who rely on them — real pharmacists, real medicine, delivered with care.'),
    ('contact', 'Contact',  'Have a question? Reach the CarePoint team at support@carepoint.ph and we''ll get back to you within one business day.'),
    ('privacy', 'Privacy Policy', 'CarePoint collects only the information needed to fulfill your orders and never sells your data to third parties.');

INSERT INTO faqs (id, q, a) VALUES
    ('faq1', 'How do I know a pharmacy on CarePoint is legitimate?', 'Every pharmacy is reviewed and approved by our team before it can list products.'),
    ('faq2', 'Can I get prescription medicine delivered?', 'Yes — upload a valid prescription at checkout and the pharmacy will verify it before dispatch.');

INSERT INTO promotions (id, title, text, active) VALUES
    ('promo1', '🌿 Welcome basket', '10% off Vitamins this week at participating pharmacies.', TRUE);

INSERT INTO homepage_banner (headline, subtext, cta_label, active) VALUES
    ('Your neighborhood apothecary, online.', 'Real pharmacies, real pharmacists, delivered with care.', 'Browse remedies', TRUE);

INSERT INTO settings (platform_name, support_email, currency, pickup_enabled, delivery_enabled, delivery_fee, free_delivery_over, low_stock_threshold, return_window_days, payments) VALUES
    ('CarePoint', 'support@carepoint.ph', 'PHP', TRUE, TRUE, 49, 1500, 10, 7,
     '{"card":true,"gcash":true,"paymaya":true,"paypal":true,"cod":true}');

-- Default notification templates for the seeded (approved) pharmacy.
INSERT INTO notif_templates (pharmacy_id, event_id, enabled, text) VALUES
    ('p1', 'orderPlaced',    TRUE, '🧾 Thanks {customer}! Order #{order} has been received by {pharmacy}.'),
    ('p1', 'orderConfirmed', TRUE, '👩‍⚕️ {pharmacy} is now preparing Order #{order}.'),
    ('p1', 'orderReady',     TRUE, '📦 Order #{order} is ready at {pharmacy}. See you soon!'),
    ('p1', 'orderCompleted', TRUE, '✅ Order #{order} is complete. Thank you for shopping with {pharmacy}!'),
    ('p1', 'orderCancelled', TRUE, '❌ Order #{order} was cancelled. Contact {pharmacy} if this was a mistake.'),
    ('p1', 'returnUpdate',   TRUE, '↩️ Your return for Order #{order} is now {status}.');