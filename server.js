const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// ============================================================
// TEST SERVER
// ============================================================

app.get('/api/test', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Server berhasil berjalan!'
    });
});

// ============================================================
// DATABASE CLEVER CLOUD
// ============================================================

const pool = mysql.createPool({
    host: 'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com',
    user: 'uks2krvuygsynrco',
    password: 'fWwkTbshbBANrTGMj8Aq',
    database: 'b7fgoctdsrijlfhczppz',
    waitForConnections: true,
    connectionLimit: 4,
    queueLimit: 0
});

// ============================================================
// ERROR HANDLER
// ============================================================

pool.on('error', (err) => {
    console.error('Database pool error:', err);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

// ============================================================
// CACHE DATA
// ============================================================

let dataCache = null;
let dataCacheTime = 0;

const DATA_CACHE_TTL = 2000;

function invalidateDataCache() {
    dataCache = null;
    dataCacheTime = 0;
}

// Semua request selain GET dianggap mengubah data
app.use((req, res, next) => {
    if (req.method !== 'GET') {
        invalidateDataCache();
    }

    next();
});

// ============================================================
// HELPER
// ============================================================

function safeNumber(value, defaultValue = 0) {
    const n = Number(value);

    if (!Number.isFinite(n)) {
        return defaultValue;
    }

    return n;
}

function safeInteger(value, defaultValue = null) {
    const n = Number(value);

    if (!Number.isInteger(n)) {
        return defaultValue;
    }

    return n;
}

function safeString(value, defaultValue = '') {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    return String(value);
}

function safeDate(value) {
    if (!value) {
        return new Date();
    }

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
        return new Date();
    }

    return d;
}

function safeJSON(value, defaultValue = []) {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    if (Array.isArray(value) || typeof value === 'object') {
        return value;
    }

    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (e) {
            return defaultValue;
        }
    }

    return defaultValue;
}

/*
 * Kolom tambahan dibuat secara non-destruktif.
 * Database lama tetap dipakai.
 * Kolom hanya ditambahkan apabila belum tersedia.
 */
async function ensureColumn(tableName, columnName, definition) {
    const allowedTables = new Set([
        'transactions',
        'tax_records',
        'retur_records',
        'app_settings'
    ]);

    if (!allowedTables.has(tableName)) {
        throw new Error('Table tidak diizinkan: ' + tableName);
    }

    const [rows] = await pool.query(`
        SELECT COUNT(*) AS cnt
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
    `, [
        tableName,
        columnName
    ]);

    if (Number(rows[0]?.cnt || 0) === 0) {
        await pool.query(
            `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
        );
    }
}

async function ensureSchemaCompatibility() {
    const transactionColumns = [
        ['bank_transfer', 'VARCHAR(100) NULL'],
        ['harga_master', 'BIGINT NULL'],
        ['harga_transaksi', 'BIGINT NULL'],
        ['invoice_group', 'VARCHAR(50) NULL'],
        ['parent_transaction_id', 'BIGINT NULL'],
        ['jenis_perubahan', 'VARCHAR(30) NULL']
    ];

    const taxColumns = [
        ['kode_pajak', 'VARCHAR(50) NULL'],
        ['invoice_group', 'VARCHAR(50) NULL'],
        ['jenis_perubahan', 'VARCHAR(30) NULL']
    ];

    const returColumns = [
        ['metode_bayar', 'VARCHAR(50) NULL'],
        ['bank_transfer', 'VARCHAR(100) NULL'],
        ['refund_amount', 'BIGINT DEFAULT 0'],
        ['exchange_amount', 'BIGINT DEFAULT 0']
    ];

    const settingColumns = [
        ['master_bank', 'JSON NULL']
    ];

    for (const [name, definition] of transactionColumns) {
        await ensureColumn(
            'transactions',
            name,
            definition
        );
    }

    for (const [name, definition] of taxColumns) {
        await ensureColumn(
            'tax_records',
            name,
            definition
        );
    }

    for (const [name, definition] of returColumns) {
        await ensureColumn(
            'retur_records',
            name,
            definition
        );
    }

    for (const [name, definition] of settingColumns) {
        await ensureColumn(
            'app_settings',
            name,
            definition
        );
    }
}

function normalizeTransactionForClient(t) {
    const out = {
        ...t
    };

    out.id = safeInteger(out.id, out.id);

    out.nomor_transaksi =
        safeString(out.nomor_transaksi);

    out.sparepart_id =
        safeInteger(out.sparepart_id, null);

    out.jumlah =
        safeNumber(out.jumlah);

    out.jumlah_dasar =
        safeNumber(out.jumlah_dasar);

    out.harga_satuan =
        safeNumber(out.harga_satuan);

    out.bayar_tunai =
        safeNumber(out.bayar_tunai);

    out.transfer_amount =
        safeNumber(out.transfer_amount);

    out.kembalian_diberikan =
        safeNumber(out.kembalian_diberikan);

    out.diskon =
        safeNumber(out.diskon);

    out.bank_transfer =
        safeString(out.bank_transfer);

    out.harga_master =
        out.harga_master == null
            ? null
            : safeNumber(out.harga_master);

    out.harga_transaksi =
        out.harga_transaksi == null
            ? out.harga_satuan
            : safeNumber(out.harga_transaksi);

    out.invoice_group =
        safeString(
            out.invoice_group,
            out.nomor_transaksi
        );

    out.parent_transaction_id =
        out.parent_transaction_id == null
            ? null
            : safeInteger(
                out.parent_transaction_id,
                null
            );

    out.jenis_perubahan =
        safeString(out.jenis_perubahan);

    return out;
}

function itemKey(item) {
    if (item?.custom_item) {
        return (
            'custom:' +
            String(item.custom_item)
                .trim()
                .toLowerCase()
        );
    }

    if (item?.sparepart_id != null) {
        return (
            'sp:' +
            String(item.sparepart_id)
        );
    }

    return (
        'unknown:' +
        String(item?.nama || '')
            .trim()
            .toLowerCase()
    );
}

function itemQtyInBase(item) {
    return (
        safeNumber(
            item?.qty ??
            item?.jumlah_dasar ??
            item?.jumlah
        ) *
        safeNumber(
            item?.konversi,
            1
        )
    );
}

function itemSubtotal(item) {
    return safeNumber(
        item?.subtotal,
        safeNumber(
            item?.harga ??
            item?.harga_satuan
        ) *
        safeNumber(
            item?.qty ??
            item?.jumlah
        )
    );
}

function buildInvoiceAggregate(
    transactions,
    returRecords,
    taxRecords,
    invoice
) {
    const invoiceNo =
        String(invoice || '');

    const sales =
        transactions
            .filter(t =>
                String(
                    t.nomor_transaksi || ''
                ) === invoiceNo &&
                String(
                    t.source || ''
                ).toLowerCase() === 'kasir' &&
                String(
                    t.jenis || ''
                ).toUpperCase() === 'KELUAR'
            )
            .map(
                normalizeTransactionForClient
            );

    const returs =
        returRecords.filter(r =>
            String(
                r.parent_invoice || ''
            ) === invoiceNo
        );

    const returnedByKey = {};

    let totalRetur = 0;
    let totalAddition = 0;

    returs.forEach(r => {
        const items =
            Array.isArray(r.items)
                ? r.items
                : [];

        items.forEach(i => {
            const key =
                itemKey(i);

            returnedByKey[key] =
                (
                    returnedByKey[key] || 0
                ) +
                safeNumber(i.qty);

            totalRetur +=
                itemSubtotal(i);
        });

        (
            Array.isArray(
                r.exchange_items
            )
                ? r.exchange_items
                : []
        ).forEach(i => {
            totalAddition +=
                itemSubtotal(i);
        });
    });

    const activeItems = [];
    const originalItems = [];

    sales.forEach(t => {
        const key =
            itemKey(t);

        const originalQty =
            safeNumber(t.jumlah);

        const alreadyReturned =
            Math.min(
                originalQty,
                safeNumber(
                    returnedByKey[key]
                )
            );

        const remainingQty =
            Math.max(
                0,
                originalQty -
                alreadyReturned
            );

        const row = {
            id: t.id,
            sparepart_id:
                t.sparepart_id,
            custom_item:
                t.custom_item,
            nama:
                t.custom_item || '',
            part_number: '',
            part_numbers_alt:
                t.part_numbers_alt || '',
            merek:
                t.merek || '',
            kode_pajak: '',
            satuan:
                t.satuan || '',
            qty:
                originalQty,
            returned_qty:
                alreadyReturned,
            remaining_qty:
                remainingQty,
            harga:
                safeNumber(
                    t.harga_satuan
                ),
            subtotal:
                safeNumber(
                    t.harga_satuan
                ) *
                originalQty,
            remaining_subtotal:
                safeNumber(
                    t.harga_satuan
                ) *
                remainingQty
        };

        originalItems.push(row);

        if (remainingQty > 0) {
            activeItems.push(row);
        }
    });

    const additions = [];

    returs.forEach(r => {
        (
            Array.isArray(
                r.exchange_items
            )
                ? r.exchange_items
                : []
        ).forEach(i => {
            additions.push({
                ...i,
                invoice:
                    invoiceNo,
                retur_id:
                    r.id,
                subtotal:
                    itemSubtotal(i)
            });
        });
    });

    const initialDiscount =
        sales.length
            ? safeNumber(
                sales[0].diskon
            )
            : 0;

    const totalInitial =
        Math.max(
            0,
            originalItems.reduce(
                (sum, i) =>
                    sum + i.subtotal,
                0
            ) -
            initialDiscount
        );

    const totalFinal =
        Math.max(
            0,
            totalInitial -
            totalRetur +
            totalAddition
        );

    let cash = 0;
    let transfer = 0;
    let bank = '';

    sales.forEach(t => {
        cash =
            Math.max(
                cash,
                safeNumber(
                    t.bayar_tunai
                )
            );

        transfer =
            Math.max(
                transfer,
                safeNumber(
                    t.transfer_amount
                )
            );

        if (t.bank_transfer) {
            bank =
                t.bank_transfer;
        }
    });

    const getReturAmounts = r => {
        const returned =
            (
                Array.isArray(
                    r.items
                )
                    ? r.items
                    : []
            ).reduce(
                (a, i) =>
                    a + itemSubtotal(i),
                0
            );

        const exchanged =
            (
                Array.isArray(
                    r.exchange_items
                )
                    ? r.exchange_items
                    : []
            ).reduce(
                (a, i) =>
                    a + itemSubtotal(i),
                0
            );

        const storedRefund =
            safeNumber(
                r.refund_amount
            );

        const storedExchange =
            safeNumber(
                r.exchange_amount
            );

        const refund =
            storedRefund > 0
                ? storedRefund
                : Math.max(
                    0,
                    returned -
                    exchanged
                );

        const exchange =
            storedExchange > 0
                ? storedExchange
                : Math.max(
                    0,
                    exchanged -
                    returned
                );

        return {
            refund,
            exchange
        };
    };

    const refundCash =
        returs
            .filter(r =>
                String(
                    r.metode_bayar ||
                    'Tunai'
                ).toLowerCase() !==
                'transfer'
            )
            .reduce(
                (sum, r) =>
                    sum +
                    getReturAmounts(r)
                        .refund,
                0
            );

    const refundTransfer =
        returs
            .filter(r =>
                String(
                    r.metode_bayar || ''
                ).toLowerCase() ===
                'transfer'
            )
            .reduce(
                (sum, r) =>
                    sum +
                    getReturAmounts(r)
                        .refund,
                0
            );

    const additionCash =
        returs
            .filter(r =>
                String(
                    r.metode_bayar ||
                    'Tunai'
                ).toLowerCase() !==
                'transfer'
            )
            .reduce(
                (sum, r) =>
                    sum +
                    getReturAmounts(r)
                        .exchange,
                0
            );

    const additionTransfer =
        returs
            .filter(r =>
                String(
                    r.metode_bayar || ''
                ).toLowerCase() ===
                'transfer'
            )
            .reduce(
                (sum, r) =>
                    sum +
                    getReturAmounts(r)
                        .exchange,
                0
            );

    const taxes =
        taxRecords.filter(t =>
            String(
                t.nomor_transaksi || ''
            ) === invoiceNo ||
            String(
                t.invoice_group || ''
            ) === invoiceNo
        );

    const effectiveTaxes =
        taxes.map(t => {
            const pct =
                safeNumber(
                    t.persentase_pajak
                );

            const subtotal =
                safeNumber(
                    t.subtotal
                );

            const value =
                safeNumber(
                    t.nilai_pajak,
                    subtotal *
                    pct /
                    100
                );

            return {
                ...t,
                subtotal,
                nilai_pajak: value,
                kode_pajak:
                    safeString(
                        t.kode_pajak
                    )
            };
        });

    const totalTax =
        effectiveTaxes.reduce(
            (sum, t) =>
                sum +
                safeNumber(
                    t.nilai_pajak
                ),
            0
        );

    return {
        invoice: invoiceNo,
        nomor_transaksi:
            invoiceNo,

        tanggal:
            sales[0]?.tanggal ||
            returs[0]?.tanggal ||
            null,

        kasir:
            sales[0]?.kasir ||
            returs[0]?.kasir ||
            '-',

        pelanggan:
            sales[0]?.tujuan ||
            returs[0]?.pelanggan ||
            'Umum',

        status_bayar:
            sales[0]?.status_bayar ||
            'Lunas',

        metode_bayar:
            sales[0]?.metode_bayar ||
            'Tunai',

        bank_transfer:
            bank || '-',

        barang_awal:
            originalItems,

        barang_aktif:
            activeItems,

        barang_retur:
            returs.flatMap(
                r =>
                    (
                        Array.isArray(
                            r.items
                        )
                            ? r.items
                            : []
                    ).map(i => ({
                        ...i,
                        retur_id:
                            r.id
                    }))
            ),

        barang_tambahan:
            additions,

        retur_records:
            returs,

        total_awal:
            totalInitial,

        total_retur:
            totalRetur,

        total_tambahan:
            totalAddition,

        total_akhir:
            totalFinal,

        diskon:
            initialDiscount,

        pajak:
            totalTax,

        cash,

        transfer,

        refund_cash:
            refundCash,

        refund_transfer:
            refundTransfer,

        tambahan_cash:
            additionCash,

        tambahan_transfer:
            additionTransfer,

        tax_records:
            effectiveTaxes,

        perubahan:
            returs.map(r => ({
                id: r.id,
                tanggal: r.tanggal,
                metode_bayar:
                    r.metode_bayar ||
                    'Tunai',
                bank_transfer:
                    r.bank_transfer ||
                    '-',
                refund_amount:
                    safeNumber(
                        r.refund_amount
                    ),
                exchange_amount:
                    safeNumber(
                        r.exchange_amount
                    )
            }))
    };
}

async function syncExtendedRows(
    conn,
    data
) {
    const txs =
        Array.isArray(
            data?.transactions
        )
            ? data.transactions
            : [];

    for (const t of txs) {
        const id =
            safeInteger(t.id);

        if (id === null) {
            continue;
        }

        await conn.query(`
            UPDATE transactions
            SET
                bank_transfer = COALESCE(?, bank_transfer),
                harga_master = COALESCE(?, harga_master),
                harga_transaksi = COALESCE(?, harga_transaksi),
                invoice_group = COALESCE(?, invoice_group, nomor_transaksi),
                parent_transaction_id = COALESCE(?, parent_transaction_id),
                jenis_perubahan = COALESCE(?, jenis_perubahan)
            WHERE id = ?
        `, [
            t.bank_transfer == null
                ? null
                : safeString(
                    t.bank_transfer
                ),

            t.harga_master == null
                ? null
                : safeNumber(
                    t.harga_master
                ),

            t.harga_transaksi == null
                ? safeNumber(
                    t.harga_satuan
                )
                : safeNumber(
                    t.harga_transaksi
                ),

            t.invoice_group == null
                ? null
                : safeString(
                    t.invoice_group
                ),

            t.parent_transaction_id == null
                ? null
                : safeInteger(
                    t.parent_transaction_id,
                    null
                ),

            t.jenis_perubahan == null
                ? null
                : safeString(
                    t.jenis_perubahan
                ),

            id
        ]);
    }

    const taxes =
        Array.isArray(
            data?.taxRecords
        )
            ? data.taxRecords
            : [];

    for (const t of taxes) {
        if (!t.tax_id) {
            continue;
        }

        await conn.query(`
            UPDATE tax_records
            SET
                kode_pajak = COALESCE(?, kode_pajak),
                invoice_group = COALESCE(?, invoice_group, nomor_transaksi),
                jenis_perubahan = COALESCE(?, jenis_perubahan)
            WHERE tax_id = ?
        `, [
            t.kode_pajak == null
                ? null
                : safeString(
                    t.kode_pajak
                ),

            t.invoice_group == null
                ? null
                : safeString(
                    t.invoice_group
                ),

            t.jenis_perubahan == null
                ? null
                : safeString(
                    t.jenis_perubahan
                ),

            String(t.tax_id)
        ]);
    }

    const returs =
        Array.isArray(
            data?.returRecords
        )
            ? data.returRecords
            : [];

    for (const r of returs) {
        if (!r || r.id == null) {
            continue;
        }

        const items =
            Array.isArray(r.items)
                ? r.items
                : [];

        const exchange =
            Array.isArray(
                r.exchange_items
            )
                ? r.exchange_items
                : [];

        const returned =
            items.reduce(
                (sum, i) =>
                    sum +
                    itemSubtotal(i),
                0
            );

        const exchanged =
            exchange.reduce(
                (sum, i) =>
                    sum +
                    itemSubtotal(i),
                0
            );

        await conn.query(`
            UPDATE retur_records
            SET
                metode_bayar = COALESCE(?, metode_bayar),
                bank_transfer = COALESCE(?, bank_transfer),
                refund_amount =
                    CASE
                        WHEN COALESCE(refund_amount,0)=0
                        THEN ?
                        ELSE refund_amount
                    END,
                exchange_amount =
                    CASE
                        WHEN COALESCE(exchange_amount,0)=0
                        THEN ?
                        ELSE exchange_amount
                    END
            WHERE id = ?
        `, [
            r.metode_bayar == null
                ? null
                : safeString(
                    r.metode_bayar
                ),

            r.bank_transfer == null
                ? null
                : safeString(
                    r.bank_transfer
                ),

            Math.max(
                0,
                returned -
                exchanged
            ),

            Math.max(
                0,
                exchanged -
                returned
            ),

            String(r.id)
        ]);
    }
}

// ============================================================
// 1. INISIALISASI TABEL
// ============================================================

app.get('/api/init', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS spareparts (
                id BIGINT PRIMARY KEY,
                kode VARCHAR(50),
                part_number VARCHAR(255),
                part_numbers_alt TEXT,
                nama VARCHAR(500),
                kategori VARCHAR(100),
                merek VARCHAR(100),
                satuan VARCHAR(50),
                stok_min INT DEFAULT 0,
                stok_awal INT DEFAULT 0,
                harga_beli BIGINT DEFAULT 0,
                harga_jual BIGINT DEFAULT 0,
                satuan_alt VARCHAR(50),
                isi_satuan_alt INT DEFAULT 0,
                harga_jual_alt BIGINT DEFAULT 0,
                pajak_status VARCHAR(20),
                kode_pajak VARCHAR(50),
                keterangan TEXT
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id BIGINT PRIMARY KEY,
                nomor_transaksi VARCHAR(50),
                tanggal DATETIME,
                sparepart_id BIGINT,
                custom_item VARCHAR(500),
                part_numbers_alt TEXT,
                merek VARCHAR(100),
                jenis VARCHAR(20),
                jumlah INT,
                satuan VARCHAR(50),
                jumlah_dasar INT,
                harga_satuan BIGINT,
                tujuan VARCHAR(255),
                keterangan TEXT,
                source VARCHAR(50),
                kasir VARCHAR(100),
                status_bayar VARCHAR(20),
                metode_bayar VARCHAR(50),
                bayar_tunai BIGINT DEFAULT 0,
                transfer_amount BIGINT DEFAULT 0,
                kembalian_diberikan BIGINT DEFAULT 0,
                diskon BIGINT DEFAULT 0,
                tanggal_lunas DATETIME NULL,
                bank_transfer VARCHAR(100) NULL,
                harga_master BIGINT NULL,
                harga_transaksi BIGINT NULL,
                invoice_group VARCHAR(50) NULL,
                parent_transaction_id BIGINT NULL,
                jenis_perubahan VARCHAR(30) NULL
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS partners (
                id BIGINT PRIMARY KEY,
                nama VARCHAR(255),
                tipe VARCHAR(50),
                telp VARCHAR(50),
                alamat TEXT
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_expenses (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100)
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cash_inflows (
                id BIGINT PRIMARY KEY,
                tanggal DATETIME,
                jumlah BIGINT,
                keterangan TEXT,
                kasir VARCHAR(100)
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tax_records (
                tax_id VARCHAR(100) PRIMARY KEY,
                trx_id BIGINT,
                tanggal DATETIME,
                nomor_transaksi VARCHAR(50),
                part_number VARCHAR(255),
                nama VARCHAR(500),
                kategori VARCHAR(100),
                merek VARCHAR(100),
                status_bayar VARCHAR(20),
                pelanggan VARCHAR(255),
                jumlah INT,
                satuan VARCHAR(50),
                harga_satuan BIGINT,
                subtotal BIGINT,
                persentase_pajak DECIMAL(5,2),
                nilai_pajak BIGINT,
                kode_pajak VARCHAR(50) NULL,
                invoice_group VARCHAR(50) NULL,
                jenis_perubahan VARCHAR(30) NULL
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS retur_records (
                id VARCHAR(50) PRIMARY KEY,
                parent_invoice VARCHAR(50),
                tanggal DATETIME,
                kasir VARCHAR(100),
                pelanggan VARCHAR(255),
                items JSON,
                exchange_items JSON,
                metode_bayar VARCHAR(50) NULL,
                bank_transfer VARCHAR(100) NULL,
                refund_amount BIGINT DEFAULT 0,
                exchange_amount BIGINT DEFAULT 0
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS app_settings (
                id INT PRIMARY KEY DEFAULT 1,
                kas_awal BIGINT DEFAULT 0,
                active_shift_start BIGINT,
                master_pajak JSON,
                users JSON,
                master_bank JSON NULL
            )
            ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
        `);

        await ensureSchemaCompatibility();

        const [settings] = await pool.query(`
            SELECT *
            FROM app_settings
            WHERE id = 1
        `);

        if (settings.length === 0) {
            await pool.query(`
                INSERT INTO app_settings
                (
                    id,
                    kas_awal,
                    active_shift_start,
                    master_pajak,
                    users
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                1,
                0,
                Date.now(),
                JSON.stringify([
                    {
                        jenis: 'Aki Basah',
                        persentase: 20
                    },
                    {
                        jenis: 'Aki Kering',
                        persentase: 11
                    },
                    {
                        jenis: 'Oli',
                        persentase: 4
                    },
                    {
                        jenis: 'Air Radiator',
                        persentase: 4
                    },
                    {
                        jenis: 'Minyak Rem',
                        persentase: 4
                    },
                    {
                        jenis: 'Lainnya',
                        persentase: 11
                    }
                ]),
                JSON.stringify([
                    {
                        username: 'owner',
                        password: 'owner123',
                        role: 'Owner',
                        name: 'Pemilik'
                    },
                    {
                        username: 'admin',
                        password: 'admin123',
                        role: 'Admin',
                        name: 'Administrator'
                    },
                    {
                        username: 'pagi',
                        password: 'pagi123',
                        role: 'Kasir',
                        name: 'Kasir Pagi'
                    },
                    {
                        username: 'siang',
                        password: 'siang123',
                        role: 'Kasir',
                        name: 'Kasir Siang'
                    }
                ])
            ]);
        }

        res.json({
            success: true,
            message: 'Database & tabel siap!'
        });
    } catch (error) {
        console.error('INIT ERROR:', error);

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 2. MIGRASI DATA
// ============================================================

app.post('/api/migrate', async (req, res) => {
    const oldData = req.body || {};

    try {
        // ----------------------------------------------------
        // SPAREPART
        // ----------------------------------------------------

        if (
            Array.isArray(oldData.spareparts) &&
            oldData.spareparts.length > 0
        ) {
            const values =
                oldData.spareparts
                    .map(sp => [
                        safeInteger(
                            sp.id,
                            Date.now()
                        ),
                        safeString(sp.kode),
                        safeString(
                            sp.part_number
                        ),
                        safeString(
                            sp.part_numbers_alt
                        ),
                        safeString(sp.nama),
                        safeString(
                            sp.kategori,
                            'Umum'
                        ),
                        safeString(sp.merek),
                        safeString(
                            sp.satuan,
                            'Pcs'
                        ),
                        safeNumber(
                            sp.stok_min
                        ),
                        safeNumber(
                            sp.stok_awal
                        ),
                        safeNumber(
                            sp.harga_beli
                        ),
                        safeNumber(
                            sp.harga_jual
                        ),
                        safeString(
                            sp.satuan_alt
                        ),
                        safeNumber(
                            sp.isi_satuan_alt
                        ),
                        safeNumber(
                            sp.harga_jual_alt
                        ),
                        safeString(
                            sp.pajak_status,
                            'Non Pajak'
                        ),
                        safeString(
                            sp.kode_pajak
                        ),
                        safeString(
                            sp.keterangan
                        )
                    ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {
                await pool.query(`
                    INSERT IGNORE INTO spareparts
                    (
                        id,
                        kode,
                        part_number,
                        part_numbers_alt,
                        nama,
                        kategori,
                        merek,
                        satuan,
                        stok_min,
                        stok_awal,
                        harga_beli,
                        harga_jual,
                        satuan_alt,
                        isi_satuan_alt,
                        harga_jual_alt,
                        pajak_status,
                        kode_pajak,
                        keterangan
                    )
                    VALUES ?
                `, [
                    values.slice(
                        i,
                        i + 500
                    )
                ]);
            }
        }

        // ----------------------------------------------------
        // TRANSACTIONS
        // ----------------------------------------------------

        if (
            Array.isArray(
                oldData.transactions
            ) &&
            oldData.transactions.length > 0
        ) {
            const values =
                oldData.transactions
                    .filter(t =>
                        safeInteger(t.id) !==
                        null
                    )
                    .map(t => [
                        safeInteger(t.id),
                        safeString(
                            t.nomor_transaksi
                        ),
                        safeDate(t.tanggal),
                        safeInteger(
                            t.sparepart_id
                        ),
                        t.custom_item ||
                            null,
                        safeString(
                            t.part_numbers_alt
                        ),
                        safeString(t.merek),
                        safeString(t.jenis),
                        safeNumber(t.jumlah),
                        safeString(t.satuan),
                        safeNumber(
                            t.jumlah_dasar
                        ),
                        safeNumber(
                            t.harga_satuan
                        ),
                        safeString(t.tujuan),
                        safeString(
                            t.keterangan
                        ),
                        safeString(t.source),
                        safeString(t.kasir),
                        safeString(
                            t.status_bayar
                        ),
                        safeString(
                            t.metode_bayar
                        ),
                        safeNumber(
                            t.bayar_tunai
                        ),
                        safeNumber(
                            t.transfer_amount
                        ),
                        safeNumber(
                            t.kembalian_diberikan
                        ),
                        safeNumber(t.diskon),
                        t.tanggal_lunas
                            ? safeDate(
                                t.tanggal_lunas
                            )
                            : null
                    ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {
                await pool.query(`
                    INSERT IGNORE INTO transactions
                    (
                        id,
                        nomor_transaksi,
                        tanggal,
                        sparepart_id,
                        custom_item,
                        part_numbers_alt,
                        merek,
                        jenis,
                        jumlah,
                        satuan,
                        jumlah_dasar,
                        harga_satuan,
                        tujuan,
                        keterangan,
                        source,
                        kasir,
                        status_bayar,
                        metode_bayar,
                        bayar_tunai,
                        transfer_amount,
                        kembalian_diberikan,
                        diskon,
                        tanggal_lunas
                    )
                    VALUES ?
                `, [
                    values.slice(
                        i,
                        i + 500
                    )
                ]);
            }
        }

        // ----------------------------------------------------
        // PARTNERS
        // ----------------------------------------------------

        if (
            Array.isArray(
                oldData.partners
            ) &&
            oldData.partners.length > 0
        ) {
            const values =
                oldData.partners
                    .filter(p =>
                        safeInteger(p.id) !==
                        null
                    )
                    .map(p => [
                        safeInteger(p.id),
                        safeString(p.nama),
                        safeString(p.tipe),
                        safeString(p.telp),
                        safeString(p.alamat)
                    ]);

            if (values.length > 0) {
                await pool.query(`
                    INSERT IGNORE INTO partners
                    (
                        id,
                        nama,
                        tipe,
                        telp,
                        alamat
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // CASH EXPENSES
        // ----------------------------------------------------

        if (
            Array.isArray(
                oldData.cashExpenses
            ) &&
            oldData.cashExpenses.length > 0
        ) {
            const values =
                oldData.cashExpenses
                    .filter(e =>
                        safeInteger(e.id) !==
                        null
                    )
                    .map(e => [
                        safeInteger(e.id),
                        safeDate(e.tanggal),
                        safeNumber(e.jumlah),
                        safeString(
                            e.keterangan
                        ),
                        safeString(e.kasir)
                    ]);

            if (values.length > 0) {
                await pool.query(`
                    INSERT IGNORE INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(
                oldData.cashInflows
            ) &&
            oldData.cashInflows.length > 0
        ) {
            const values =
                oldData.cashInflows
                    .filter(i =>
                        safeInteger(i.id) !==
                        null
                    )
                    .map(i => [
                        safeInteger(i.id),
                        safeDate(i.tanggal),
                        safeNumber(i.jumlah),
                        safeString(
                            i.keterangan
                        ),
                        safeString(i.kasir)
                    ]);

            if (values.length > 0) {
                await pool.query(`
                    INSERT IGNORE INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(
                oldData.taxRecords
            ) &&
            oldData.taxRecords.length > 0
        ) {
            const values =
                oldData.taxRecords
                    .filter(t =>
                        t &&
                        t.tax_id
                    )
                    .map(t => [
                        safeString(
                            t.tax_id
                        ),
                        safeInteger(
                            t.trx_id,
                            0
                        ),
                        safeDate(t.tanggal),
                        safeString(
                            t.nomor_transaksi
                        ),
                        safeString(
                            t.part_number
                        ),
                        safeString(t.nama),
                        safeString(
                            t.kategori
                        ),
                        safeString(t.merek),
                        safeString(
                            t.status_bayar
                        ),
                        safeString(
                            t.pelanggan
                        ),
                        safeNumber(t.jumlah),
                        safeString(
                            t.satuan
                        ),
                        safeNumber(
                            t.harga_satuan
                        ),
                        safeNumber(
                            t.subtotal
                        ),
                        safeNumber(
                            t.persentase_pajak
                        ),
                        safeNumber(
                            t.nilai_pajak
                        )
                    ]);

            if (values.length > 0) {
                await pool.query(`
                    INSERT IGNORE INTO tax_records
                    (
                        tax_id,
                        trx_id,
                        tanggal,
                        nomor_transaksi,
                        part_number,
                        nama,
                        kategori,
                        merek,
                        status_bayar,
                        pelanggan,
                        jumlah,
                        satuan,
                        harga_satuan,
                        subtotal,
                        persentase_pajak,
                        nilai_pajak
                    )
                    VALUES ?
                `, [values]);
            }
        }

        // ----------------------------------------------------
        // SETTINGS
        // ----------------------------------------------------

        if (
            oldData.kasAwal !== undefined ||
            oldData.users
        ) {
            await pool.query(`
                UPDATE app_settings
                SET
                    kas_awal = ?,
                    active_shift_start = ?,
                    master_pajak = ?,
                    users = ?
                WHERE id = 1
            `, [
                safeNumber(
                    oldData.kasAwal
                ),
                oldData.activeShiftStart ||
                    Date.now(),
                JSON.stringify(
                    oldData.masterPajak ||
                        []
                ),
                JSON.stringify(
                    oldData.users ||
                        []
                )
            ]);
        }

        await syncExtendedRows(
            pool,
            oldData
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Migrasi data lama berhasil!'
        });
    } catch (error) {
        console.error(
            'MIGRATE ERROR:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 3. GET ALL DATA
// ============================================================

app.get('/api/data', async (req, res) => {
    const now = Date.now();

    if (
        dataCache &&
        (
            now -
            dataCacheTime
        ) <
        DATA_CACHE_TTL
    ) {
        return res.json(
            dataCache
        );
    }

    let connection;

    try {
        connection =
            await pool.getConnection();

        const [spareparts] =
            await connection.query(`
                SELECT *
                FROM spareparts
            `);

        const [transactions] =
            await connection.query(`
                SELECT *
                FROM transactions
            `);

        const [partners] =
            await connection.query(`
                SELECT *
                FROM partners
            `);

        const [cashExpenses] =
            await connection.query(`
                SELECT *
                FROM cash_expenses
            `);

        const [cashInflows] =
            await connection.query(`
                SELECT *
                FROM cash_inflows
            `);

        const [taxRecords] =
            await connection.query(`
                SELECT *
                FROM tax_records
            `);

        let returs = [];

        try {
            const [returResult] =
                await connection.query(`
                    SELECT *
                    FROM retur_records
                `);

            returs =
                returResult;
        } catch (e) {
            console.error(
                'Gagal membaca retur_records:',
                e.message
            );
        }

        const [settings] =
            await connection.query(`
                SELECT *
                FROM app_settings
                WHERE id = 1
            `);

        // ----------------------------------------------------
        // DATE CONVERSION
        // ----------------------------------------------------

        transactions.forEach(t => {
            Object.assign(
                t,
                normalizeTransactionForClient(t)
            );

            if (
                t.tanggal instanceof Date
            ) {
                t.tanggal =
                    t.tanggal.toISOString();
            }

            if (
                t.tanggal_lunas instanceof Date
            ) {
                t.tanggal_lunas =
                    t.tanggal_lunas.toISOString();
            }
        });

        cashExpenses.forEach(e => {
            if (
                e.tanggal instanceof Date
            ) {
                e.tanggal =
                    e.tanggal.toISOString();
            }
        });

        cashInflows.forEach(i => {
            if (
                i.tanggal instanceof Date
            ) {
                i.tanggal =
                    i.tanggal.toISOString();
            }
        });

        taxRecords.forEach(t => {
            t.trx_id =
                safeInteger(
                    t.trx_id,
                    0
                );

            t.jumlah =
                safeNumber(t.jumlah);

            t.harga_satuan =
                safeNumber(
                    t.harga_satuan
                );

            t.subtotal =
                safeNumber(
                    t.subtotal
                );

            t.persentase_pajak =
                safeNumber(
                    t.persentase_pajak
                );

            t.nilai_pajak =
                safeNumber(
                    t.nilai_pajak
                );

            t.kode_pajak =
                safeString(
                    t.kode_pajak
                );

            t.invoice_group =
                safeString(
                    t.invoice_group,
                    t.nomor_transaksi
                );

            t.jenis_perubahan =
                safeString(
                    t.jenis_perubahan
                );

            if (
                t.tanggal instanceof Date
            ) {
                t.tanggal =
                    t.tanggal.toISOString();
            }
        });

        // ----------------------------------------------------
        // RETUR
        // ----------------------------------------------------

        const returRecords =
            returs.map(r => {
                let items =
                    safeJSON(
                        r.items,
                        []
                    );

                let exchangeItems =
                    safeJSON(
                        r.exchange_items,
                        []
                    );

                if (
                    !Array.isArray(items)
                ) {
                    items = [];
                }

                if (
                    !Array.isArray(
                        exchangeItems
                    )
                ) {
                    exchangeItems = [];
                }

                let tanggal =
                    r.tanggal;

                if (tanggal) {
                    tanggal =
                        safeDate(
                            tanggal
                        ).toISOString();
                }

                return {
                    ...r,

                    id:
                        safeString(r.id),

                    parent_invoice:
                        safeString(
                            r.parent_invoice
                        ),

                    tanggal,

                    kasir:
                        safeString(
                            r.kasir
                        ),

                    pelanggan:
                        safeString(
                            r.pelanggan
                        ),

                    metode_bayar:
                        safeString(
                            r.metode_bayar,
                            'Tunai'
                        ),

                    bank_transfer:
                        safeString(
                            r.bank_transfer
                        ),

                    refund_amount:
                        safeNumber(
                            r.refund_amount
                        ),

                    exchange_amount:
                        safeNumber(
                            r.exchange_amount
                        ),

                    items,

                    exchange_items:
                        exchangeItems
                };
            });

        // ----------------------------------------------------
        // SETTINGS
        // ----------------------------------------------------

        let masterPajak =
            settings[0]?.master_pajak ||
            [];

        if (
            typeof masterPajak ===
            'string'
        ) {
            try {
                masterPajak =
                    JSON.parse(
                        masterPajak
                    );
            } catch (e) {
                masterPajak = [];
            }
        }

        let users =
            settings[0]?.users ||
            [];

        if (
            typeof users ===
            'string'
        ) {
            try {
                users =
                    JSON.parse(
                        users
                    );
            } catch (e) {
                users = [];
            }
        }

        let masterBank =
            settings[0]?.master_bank ||
            [];

        if (
            typeof masterBank ===
            'string'
        ) {
            try {
                masterBank =
                    JSON.parse(
                        masterBank
                    );
            } catch (e) {
                masterBank = [];
            }
        }

        if (
            !Array.isArray(
                masterBank
            )
        ) {
            masterBank = [];
        }

        const invoiceNumbers =
            [
                ...new Set(
                    transactions
                        .filter(t =>
                            t.source ===
                                'Kasir' &&
                            t.nomor_transaksi
                        )
                        .map(t =>
                            String(
                                t.nomor_transaksi
                            )
                        )
                )
            ];

        const invoiceGroups =
            invoiceNumbers.map(
                invoice =>
                    buildInvoiceAggregate(
                        transactions,
                        returRecords,
                        taxRecords,
                        invoice
                    )
            );

        const result = {
            spareparts,

            transactions,

            partners,

            cashExpenses,

            cashInflows,

            taxRecords,

            returRecords,

            kasAwal:
                settings[0]?.kas_awal ||
                0,

            activeShiftStart:
                settings[0]
                    ?.active_shift_start ||
                Date.now(),

            masterPajak,

            users,

            masterBank,

            invoiceGroups
        };

        dataCache =
            result;

        dataCacheTime =
            Date.now();

        res.json(
            result
        );
    } catch (error) {
        console.error(
            'Error GET DATA:',
            error
        );

        if (dataCache) {
            console.log(
                'Mengembalikan data cache karena error database'
            );

            return res.json(
                dataCache
            );
        }

        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ============================================================
// 4. SPAREPART
// ============================================================

app.post('/api/sparepart', async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO spareparts SET ?',
            req.body
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Sparepart disimpan'
        });
    } catch (error) {
        console.error(
            'Error sparepart:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/sparepart/bulk', async (req, res) => {
    const { items } =
        req.body;

    try {
        if (
            Array.isArray(items) &&
            items.length > 0
        ) {
            const values =
                items
                    .filter(sp =>
                        safeInteger(
                            sp.id
                        ) !== null
                    )
                    .map(sp => [
                        safeInteger(sp.id),
                        safeString(sp.kode),
                        safeString(
                            sp.part_number
                        ),
                        safeString(
                            sp.part_numbers_alt
                        ),
                        safeString(sp.nama),
                        safeString(
                            sp.kategori,
                            'Umum'
                        ),
                        safeString(sp.merek),
                        safeString(
                            sp.satuan,
                            'Pcs'
                        ),
                        safeNumber(
                            sp.stok_min
                        ),
                        safeNumber(
                            sp.stok_awal
                        ),
                        safeNumber(
                            sp.harga_beli
                        ),
                        safeNumber(
                            sp.harga_jual
                        ),
                        safeString(
                            sp.satuan_alt
                        ),
                        safeNumber(
                            sp.isi_satuan_alt
                        ),
                        safeNumber(
                            sp.harga_jual_alt
                        ),
                        safeString(
                            sp.pajak_status,
                            'Non Pajak'
                        ),
                        safeString(
                            sp.kode_pajak
                        ),
                        safeString(
                            sp.keterangan
                        )
                    ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {
                await pool.query(`
                    INSERT IGNORE INTO spareparts
                    (
                        id,
                        kode,
                        part_number,
                        part_numbers_alt,
                        nama,
                        kategori,
                        merek,
                        satuan,
                        stok_min,
                        stok_awal,
                        harga_beli,
                        harga_jual,
                        satuan_alt,
                        isi_satuan_alt,
                        harga_jual_alt,
                        pajak_status,
                        kode_pajak,
                        keterangan
                    )
                    VALUES ?
                `, [
                    values.slice(
                        i,
                        i + 500
                    )
                ]);
            }
        }

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Sparepart bulk disimpan'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/sparepart/:id', async (req, res) => {
    const id =
        safeInteger(
            req.params.id
        );

    if (id === null) {
        return res.status(400).json({
            success: false,
            error:
                'ID sparepart tidak valid'
        });
    }

    try {
        await pool.query(
            'UPDATE spareparts SET ? WHERE id = ?',
            [
                req.body,
                id
            ]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Sparepart diupdate'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/sparepart/:id', async (req, res) => {
    const id =
        safeInteger(
            req.params.id
        );

    if (id === null) {
        return res.status(400).json({
            success: false,
            error:
                'ID sparepart tidak valid'
        });
    }

    try {
        await pool.query(
            'DELETE FROM spareparts WHERE id = ?',
            [id]
        );

        await pool.query(
            'DELETE FROM transactions WHERE sparepart_id = ?',
            [id]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Sparepart dihapus'
        });
    } catch (error) {
        console.error(
            'Error hapus sparepart:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 5. TRANSAKSI
// ============================================================

app.post('/api/transactions', async (req, res) => {
    const {
        transactions,
        taxRecords
    } = req.body || {};

    if (!Array.isArray(transactions)) {
        return res.status(400).json({
            success: false,
            error:
                'Data transactions harus berupa array'
        });
    }

    const trxList =
        transactions.filter(
            t =>
                t &&
                safeInteger(t.id) !==
                null
        );

    const taxList =
        Array.isArray(taxRecords)
            ? taxRecords.filter(
                t =>
                    t &&
                    t.tax_id
            )
            : [];

    if (
        trxList.length === 0 &&
        taxList.length === 0
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Tidak ada data transaksi untuk disimpan'
        });
    }

    let conn;

    try {
        conn =
            await pool.getConnection();

        await conn.beginTransaction();

        const sparepartIds =
            [
                ...new Set(
                    trxList
                        .map(t =>
                            safeInteger(
                                t.sparepart_id
                            )
                        )
                        .filter(
                            v =>
                                v !== null
                        )
                )
            ];

        const sparepartMap =
            new Map();

        if (
            sparepartIds.length
        ) {
            const [rows] =
                await conn.query(
                    `
                    SELECT
                        id,
                        stok_awal,
                        harga_jual,
                        harga_jual_alt,
                        kode_pajak,
                        pajak_status,
                        part_number,
                        part_numbers_alt,
                        merek,
                        satuan,
                        satuan_alt,
                        isi_satuan_alt
                    FROM spareparts
                    WHERE id IN (?)
                    `,
                    [sparepartIds]
                );

            rows.forEach(
                sp =>
                    sparepartMap.set(
                        Number(sp.id),
                        sp
                    )
            );
        }

        const ids =
            trxList
                .map(t =>
                    safeInteger(t.id)
                )
                .filter(
                    v =>
                        v !== null
                );

        const existingIds =
            new Set();

        if (ids.length) {
            const [rows] =
                await conn.query(
                    `
                    SELECT id
                    FROM transactions
                    WHERE id IN (?)
                    `,
                    [ids]
                );

            rows.forEach(
                r =>
                    existingIds.add(
                        Number(r.id)
                    )
            );
        }

        const stockDemand =
            new Map();

        const stockReturn =
            new Map();

        for (const t of trxList) {
            const id =
                safeInteger(t.id);

            if (
                id === null ||
                existingIds.has(id)
            ) {
                continue;
            }

            const jenis =
                String(
                    t.jenis || ''
                ).toUpperCase();

            const spId =
                safeInteger(
                    t.sparepart_id
                );

            if (spId === null) {
                continue;
            }

            const qtyDasar =
                safeNumber(
                    t.jumlah_dasar,
                    safeNumber(
                        t.jumlah
                    ) *
                    safeNumber(
                        t.konversi,
                        1
                    )
                );

            if (
                jenis ===
                'KELUAR'
            ) {
                stockDemand.set(
                    spId,
                    (
                        stockDemand.get(
                            spId
                        ) || 0
                    ) +
                    qtyDasar
                );
            }

            if (
                jenis ===
                'MASUK'
            ) {
                stockReturn.set(
                    spId,
                    (
                        stockReturn.get(
                            spId
                        ) || 0
                    ) +
                    qtyDasar
                );
            }
        }

        for (
            const [
                spId,
                demand
            ] of stockDemand
        ) {
            const sp =
                sparepartMap.get(
                    spId
                );

            if (!sp) {
                await conn.rollback();

                return res.status(404).json({
                    success: false,
                    error:
                        `Sparepart ID ${spId} tidak ditemukan`
                });
            }

            const [
                stockRows
            ] =
                await conn.query(`
                    SELECT
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN UPPER(COALESCE(jenis,'')) = 'MASUK'
                                        THEN COALESCE(jumlah_dasar, jumlah, 0)
                                    WHEN UPPER(COALESCE(jenis,'')) = 'KELUAR'
                                        THEN -COALESCE(jumlah_dasar, jumlah, 0)
                                    ELSE 0
                                END
                            ),
                            0
                        ) AS movement
                    FROM transactions
                    WHERE sparepart_id = ?
                `, [
                    spId
                ]);

            const currentStock =
                safeNumber(
                    sp.stok_awal
                ) +
                safeNumber(
                    stockRows[0]
                        ?.movement
                ) +
                safeNumber(
                    stockReturn.get(
                        spId
                    )
                );

            if (
                demand >
                currentStock
            ) {
                await conn.rollback();

                return res.status(409).json({
                    success: false,
                    error:
                        `Stok ${spId} tidak cukup. Dibutuhkan ${demand}, tersedia ${currentStock}`
                });
            }
        }

        if (
            trxList.length
        ) {
            const values =
                trxList.map(t => {
                    const id =
                        safeInteger(
                            t.id
                        );

                    const spId =
                        safeInteger(
                            t.sparepart_id
                        );

                    const sp =
                        spId !== null
                            ? sparepartMap.get(
                                spId
                            )
                            : null;

                    const hargaTransaksi =
                        safeNumber(
                            t.harga_satuan
                        );

                    const hargaMaster =
                        t.harga_master != null
                            ? safeNumber(
                                t.harga_master
                            )
                            : (
                                String(
                                    t.satuan ||
                                    ''
                                ) ===
                                String(
                                    sp?.satuan_alt ||
                                    ''
                                ) &&
                                sp?.harga_jual_alt !=
                                null
                            )
                                ? safeNumber(
                                    sp.harga_jual_alt
                                )
                                : safeNumber(
                                    sp?.harga_jual
                                );

                    return [
                        id,

                        safeString(
                            t.nomor_transaksi
                        ),

                        safeDate(
                            t.tanggal
                        ),

                        spId,

                        t.custom_item ||
                            null,

                        safeString(
                            t.part_numbers_alt ||
                            sp?.part_numbers_alt
                        ),

                        safeString(
                            t.merek ||
                            sp?.merek
                        ),

                        safeString(
                            t.jenis
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan ||
                            sp?.satuan,
                            'Pcs'
                        ),

                        safeNumber(
                            t.jumlah_dasar,
                            safeNumber(
                                t.jumlah
                            )
                        ),

                        hargaTransaksi,

                        safeString(
                            t.tujuan
                        ),

                        safeString(
                            t.keterangan
                        ),

                        safeString(
                            t.source
                        ),

                        safeString(
                            t.kasir
                        ),

                        safeString(
                            t.status_bayar
                        ),

                        safeString(
                            t.metode_bayar
                        ),

                        safeNumber(
                            t.bayar_tunai
                        ),

                        safeNumber(
                            t.transfer_amount
                        ),

                        safeNumber(
                            t.kembalian_diberikan
                        ),

                        safeNumber(
                            t.diskon
                        ),

                        t.tanggal_lunas
                            ? safeDate(
                                t.tanggal_lunas
                            )
                            : null,

                        safeString(
                            t.bank_transfer
                        ),

                        hargaMaster,

                        hargaTransaksi,

                        safeString(
                            t.invoice_group,
                            t.nomor_transaksi
                        ),

                        t.parent_transaction_id ==
                            null
                            ? null
                            : safeInteger(
                                t.parent_transaction_id,
                                null
                            ),

                        safeString(
                            t.jenis_perubahan
                        )
                    ];
                });

            await conn.query(`
                INSERT IGNORE INTO transactions
                (
                    id,
                    nomor_transaksi,
                    tanggal,
                    sparepart_id,
                    custom_item,
                    part_numbers_alt,
                    merek,
                    jenis,
                    jumlah,
                    satuan,
                    jumlah_dasar,
                    harga_satuan,
                    tujuan,
                    keterangan,
                    source,
                    kasir,
                    status_bayar,
                    metode_bayar,
                    bayar_tunai,
                    transfer_amount,
                    kembalian_diberikan,
                    diskon,
                    tanggal_lunas,
                    bank_transfer,
                    harga_master,
                    harga_transaksi,
                    invoice_group,
                    parent_transaction_id,
                    jenis_perubahan
                )
                VALUES ?
            `, [
                values
            ]);
        }

        if (
            taxList.length
        ) {
            const values =
                taxList.map(t => {
                    const trxId =
                        safeInteger(
                            t.trx_id,
                            0
                        );

                    const tr =
                        trxList.find(
                            x =>
                                safeInteger(
                                    x.id
                                ) ===
                                trxId
                        );

                    const spId =
                        safeInteger(
                            t.sparepart_id ??
                            tr?.sparepart_id
                        );

                    const sp =
                        spId !== null
                            ? sparepartMap.get(
                                spId
                            )
                            : null;

                    return [
                        safeString(
                            t.tax_id
                        ),

                        trxId,

                        safeDate(
                            t.tanggal
                        ),

                        safeString(
                            t.nomor_transaksi ||
                            tr?.nomor_transaksi
                        ),

                        safeString(
                            t.part_number ||
                            sp?.part_number
                        ),

                        safeString(
                            t.nama ||
                            tr?.custom_item ||
                            ''
                        ),

                        safeString(
                            t.kategori
                        ),

                        safeString(
                            t.merek ||
                            sp?.merek
                        ),

                        safeString(
                            t.status_bayar ||
                            tr?.status_bayar
                        ),

                        safeString(
                            t.pelanggan ||
                            tr?.tujuan ||
                            ''
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan ||
                            tr?.satuan
                        ),

                        safeNumber(
                            t.harga_satuan ??
                            tr?.harga_satuan
                        ),

                        safeNumber(
                            t.subtotal,
                            safeNumber(
                                t.harga_satuan ??
                                tr?.harga_satuan
                            ) *
                            safeNumber(
                                t.jumlah
                            )
                        ),

                        safeNumber(
                            t.persentase_pajak
                        ),

                        safeNumber(
                            t.nilai_pajak
                        ),

                        safeString(
                            t.kode_pajak ||
                            sp?.kode_pajak
                        ),

                        safeString(
                            t.invoice_group ||
                            t.nomor_transaksi ||
                            tr?.nomor_transaksi
                        ),

                        safeString(
                            t.jenis_perubahan ||
                            (
                                String(
                                    tr?.source ||
                                    ''
                                ).toLowerCase() ===
                                'retur'
                                    ? 'TAMBAHAN'
                                    : ''
                            )
                        )
                    ];
                });

            await conn.query(`
                INSERT IGNORE INTO tax_records
                (
                    tax_id,
                    trx_id,
                    tanggal,
                    nomor_transaksi,
                    part_number,
                    nama,
                    kategori,
                    merek,
                    status_bayar,
                    pelanggan,
                    jumlah,
                    satuan,
                    harga_satuan,
                    subtotal,
                    persentase_pajak,
                    nilai_pajak,
                    kode_pajak,
                    invoice_group,
                    jenis_perubahan
                )
                VALUES ?
            `, [
                values
            ]);
        }

        for (
            const t of trxList
        ) {
            const id =
                safeInteger(
                    t.id
                );

            if (id === null) {
                continue;
            }

            const sp =
                sparepartMap.get(
                    safeInteger(
                        t.sparepart_id
                    )
                );

            await conn.query(`
                UPDATE transactions
                SET
                    bank_transfer =
                        COALESCE(
                            ?,
                            bank_transfer,
                            ''
                        ),

                    harga_master =
                        COALESCE(
                            harga_master,
                            ?
                        ),

                    harga_transaksi =
                        COALESCE(
                            harga_transaksi,
                            harga_satuan
                        ),

                    invoice_group =
                        COALESCE(
                            invoice_group,
                            nomor_transaksi
                        ),

                    parent_transaction_id =
                        COALESCE(
                            parent_transaction_id,
                            ?
                        ),

                    jenis_perubahan =
                        COALESCE(
                            jenis_perubahan,
                            ?
                        )
                WHERE id = ?
            `, [
                safeString(
                    t.bank_transfer
                ),

                t.harga_master != null
                    ? safeNumber(
                        t.harga_master
                    )
                    : safeNumber(
                        sp?.harga_jual
                    ),

                t.parent_transaction_id ==
                    null
                    ? null
                    : safeInteger(
                        t.parent_transaction_id,
                        null
                    ),

                safeString(
                    t.jenis_perubahan
                ),

                id
            ]);
        }

        await conn.commit();

        invalidateDataCache();

        return res.json({
            success: true,
            message:
                'Transaksi disimpan',
            savedTransactions:
                trxList.length,
            savedTaxRecords:
                taxList.length
        });
    } catch (error) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (e) {
                console.error(
                    'Rollback transaksi error:',
                    e
                );
            }
        }

        console.error(
            'Error transaksi:',
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (conn) {
            conn.release();
        }
    }
});

// ============================================================
// 6. SIMPAN RETUR
// ============================================================

app.post('/api/transaction/retur', async (req, res) => {
    const body =
        req.body || {};

    let returRecord =
        body.returRecord ||
        body.retur ||
        body.returnRecord ||
        body.return ||
        null;

    let transactions =
        Array.isArray(
            body.transactions
        )
            ? body.transactions
            : [];

    let taxRecords =
        Array.isArray(
            body.taxRecords ||
            body.tax_records
        )
            ? (
                body.taxRecords ||
                body.tax_records
            )
            : [];

    if (
        !returRecord &&
        body.id &&
        (
            body.parent_invoice ||
            body.parentInvoice
        )
    ) {
        returRecord =
            body;
    }

    if (
        !returRecord ||
        typeof returRecord !==
        'object'
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Data retur tidak valid: returRecord tidak ditemukan'
        });
    }

    const returId =
        returRecord.id ||
        returRecord.retur_id ||
        returRecord.returId;

    const parentInvoice =
        returRecord.parent_invoice ||
        returRecord.parentInvoice ||
        returRecord.invoice ||
        returRecord.no_invoice ||
        returRecord.nomor_transaksi;

    const tanggal =
        returRecord.tanggal ||
        returRecord.date ||
        new Date();

    const kasir =
        returRecord.kasir ||
        returRecord.user ||
        returRecord.operator ||
        '';

    const pelanggan =
        returRecord.pelanggan ||
        returRecord.customer ||
        returRecord.nama_pelanggan ||
        '';

    const items =
        Array.isArray(
            returRecord.items ||
            returRecord.retur_items ||
            returRecord.return_items
        )
            ? (
                returRecord.items ||
                returRecord.retur_items ||
                returRecord.return_items
            )
            : [];

    const exchangeItems =
        Array.isArray(
            returRecord.exchange_items ||
            returRecord.exchangeItems ||
            returRecord.tukar_items ||
            returRecord.tukarItems
        )
            ? (
                returRecord.exchange_items ||
                returRecord.exchangeItems ||
                returRecord.tukar_items ||
                returRecord.tukarItems
            )
            : [];

    const metodeBayar =
        safeString(
            returRecord.metode_bayar ||
            returRecord.metodeBayar,
            'Tunai'
        );

    const bankTransfer =
        safeString(
            returRecord.bank_transfer ||
            returRecord.bankTransfer
        );

    const paymentMethod =
        metodeBayar.toLowerCase();

    if (!returId) {
        return res.status(400).json({
            success: false,
            error:
                'Data retur tidak valid: ID retur tidak ditemukan'
        });
    }

    if (!parentInvoice) {
        return res.status(400).json({
            success: false,
            error:
                'Data retur tidak valid: nomor invoice tidak ditemukan'
        });
    }

    if (
        ![
            'tunai',
            'transfer',
            'tukar'
        ].includes(
            paymentMethod
        )
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Metode pembayaran retur tidak valid'
        });
    }

    if (
        paymentMethod ===
            'transfer' &&
        bankTransfer === '' &&
        (
            items.length ||
            exchangeItems.length
        )
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Bank/channel transfer wajib diisi untuk retur transfer'
        });
    }

    let conn;

    try {
        conn =
            await pool.getConnection();

        await conn.beginTransaction();

        const [duplicate] =
            await conn.query(
                `
                SELECT id
                FROM retur_records
                WHERE id = ?
                LIMIT 1
                `,
                [
                    String(returId)
                ]
            );

        if (
            duplicate.length
        ) {
            const [existing] =
                await conn.query(
                    `
                    SELECT *
                    FROM retur_records
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        String(returId)
                    ]
                );

            await conn.commit();

            return res.json({
                success: true,
                message:
                    'Retur sudah tersimpan',
                returId:
                    String(returId),
                parentInvoice:
                    String(parentInvoice),
                record:
                    existing[0] ||
                    null
            });
        }

        const [sales] =
            await conn.query(`
                SELECT *
                FROM transactions
                WHERE nomor_transaksi = ?
                  AND UPPER(
                        COALESCE(
                            source,
                            ''
                        )
                      ) = 'KASIR'
                  AND UPPER(
                        COALESCE(
                            jenis,
                            ''
                        )
                      ) = 'KELUAR'
                ORDER BY id ASC
            `, [
                String(parentInvoice)
            ]);

        if (
            !sales.length
        ) {
            await conn.rollback();

            return res.status(404).json({
                success: false,
                error:
                    'Invoice penjualan tidak ditemukan'
            });
        }

        const [priorRows] =
            await conn.query(`
                SELECT items
                FROM retur_records
                WHERE parent_invoice = ?
            `, [
                String(parentInvoice)
            ]);

        const alreadyReturned =
            new Map();

        priorRows.forEach(
            row => {
                const priorItems =
                    safeJSON(
                        row.items,
                        []
                    );

                if (
                    !Array.isArray(
                        priorItems
                    )
                ) {
                    return;
                }

                priorItems.forEach(
                    i => {
                        const key =
                            itemKey(i);

                        alreadyReturned.set(
                            key,
                            (
                                alreadyReturned.get(
                                    key
                                ) || 0
                            ) +
                            safeNumber(
                                i.qty
                            )
                        );
                    }
                );
            }
        );

        const soldQty =
            new Map();

        sales.forEach(
            t => {
                const key =
                    itemKey(t);

                soldQty.set(
                    key,
                    (
                        soldQty.get(
                            key
                        ) || 0
                    ) +
                    safeNumber(
                        t.jumlah
                    )
                );
            }
        );

        for (
            const item of items
        ) {
            const qty =
                safeNumber(
                    item.qty
                );

            if (
                !Number.isFinite(
                    qty
                ) ||
                qty <= 0
            ) {
                await conn.rollback();

                return res.status(400).json({
                    success: false,
                    error:
                        `Qty retur tidak valid untuk ${item.nama || 'barang'}`
                });
            }

            const key =
                itemKey(item);

            const max =
                safeNumber(
                    soldQty.get(
                        key
                    )
                );

            const used =
                safeNumber(
                    alreadyReturned.get(
                        key
                    )
                );

            if (
                max <= 0 ||
                used + qty > max
            ) {
                await conn.rollback();

                return res.status(409).json({
                    success: false,
                    error:
                        `Qty retur ${item.nama || key} melebihi qty yang tersedia untuk diretur`,
                    qtyTerjual:
                        max,
                    qtySudahDiretur:
                        used,
                    qtyDiminta:
                        qty
                });
            }
        }

        const exchangeDemand =
            new Map();

        exchangeItems.forEach(
            item => {
                const spId =
                    safeInteger(
                        item.sparepart_id
                    );

                const qtyBase =
                    itemQtyInBase(
                        item
                    );

                if (
                    spId !== null
                ) {
                    exchangeDemand.set(
                        spId,
                        (
                            exchangeDemand.get(
                                spId
                            ) || 0
                        ) +
                        qtyBase
                    );
                }
            }
        );

        for (
            const [
                spId,
                demand
            ] of exchangeDemand
        ) {
            const [spRows] =
                await conn.query(
                    `
                    SELECT
                        id,
                        stok_awal,
                        harga_jual,
                        harga_jual_alt,
                        kode_pajak,
                        pajak_status,
                        part_number,
                        part_numbers_alt,
                        merek,
                        satuan,
                        satuan_alt,
                        isi_satuan_alt
                    FROM spareparts
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [
                        spId
                    ]
                );

            if (
                !spRows.length
            ) {
                await conn.rollback();

                return res.status(404).json({
                    success: false,
                    error:
                        `Sparepart ID ${spId} tidak ditemukan`
                });
            }

            const [movRows] =
                await conn.query(`
                    SELECT
                        COALESCE(
                            SUM(
                                CASE
                                    WHEN UPPER(
                                        COALESCE(
                                            jenis,
                                            ''
                                        )
                                    ) = 'MASUK'
                                        THEN COALESCE(
                                            jumlah_dasar,
                                            jumlah,
                                            0
                                        )

                                    WHEN UPPER(
                                        COALESCE(
                                            jenis,
                                            ''
                                        )
                                    ) = 'KELUAR'
                                        THEN -COALESCE(
                                            jumlah_dasar,
                                            jumlah,
                                            0
                                        )

                                    ELSE 0
                                END
                            ),
                            0
                        ) AS movement
                    FROM transactions
                    WHERE sparepart_id = ?
                `, [
                    spId
                ]);

            const stock =
                safeNumber(
                    spRows[0].stok_awal
                ) +
                safeNumber(
                    movRows[0]
                        ?.movement
                );

            if (
                demand > stock
            ) {
                await conn.rollback();

                return res.status(409).json({
                    success: false,
                    error:
                        `Stok barang pengganti ${spId} tidak cukup`,
                    dibutuhkan:
                        demand,
                    tersedia:
                        stock
                });
            }
        }

        const normalizedItems =
            items.map(i => ({
                ...i,

                qty:
                    safeNumber(
                        i.qty
                    ),

                harga:
                    safeNumber(
                        i.harga ??
                        i.harga_satuan
                    ),

                subtotal:
                    safeNumber(
                        i.subtotal,
                        safeNumber(
                            i.harga ??
                            i.harga_satuan
                        ) *
                        safeNumber(
                            i.qty
                        )
                    )
            }));

        const normalizedExchangeItems =
            exchangeItems.map(i => ({
                ...i,

                qty:
                    safeNumber(
                        i.qty
                    ),

                harga:
                    safeNumber(
                        i.harga ??
                        i.harga_satuan
                    ),

                subtotal:
                    safeNumber(
                        i.subtotal,
                        safeNumber(
                            i.harga ??
                            i.harga_satuan
                        ) *
                        safeNumber(
                            i.qty
                        )
                    )
            }));

        const refundAmount =
            normalizedItems.reduce(
                (sum, i) =>
                    sum +
                    safeNumber(
                        i.subtotal
                    ),
                0
            );

        const exchangeAmount =
            normalizedExchangeItems.reduce(
                (sum, i) =>
                    sum +
                    safeNumber(
                        i.subtotal
                    ),
                0
            );

        const netDifference =
            refundAmount -
            exchangeAmount;

        const actualRefund =
            Math.max(
                0,
                netDifference
            );

        const actualAdditional =
            Math.max(
                0,
                -netDifference
            );

        await conn.query(`
            INSERT INTO retur_records
            (
                id,
                parent_invoice,
                tanggal,
                kasir,
                pelanggan,
                items,
                exchange_items,
                metode_bayar,
                bank_transfer,
                refund_amount,
                exchange_amount
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            String(returId),

            String(
                parentInvoice
            ),

            new Date(tanggal),

            String(kasir),

            String(pelanggan),

            JSON.stringify(
                normalizedItems
            ),

            JSON.stringify(
                normalizedExchangeItems
            ),

            metodeBayar,

            bankTransfer ||
                null,

            actualRefund,

            actualAdditional
        ]);

        if (
            transactions.length > 0
        ) {
            const values =
                transactions
                    .filter(
                        t =>
                            t &&
                            safeInteger(
                                t.id
                            ) !== null
                    )
                    .map(t => [
                        safeInteger(
                            t.id
                        ),

                        safeString(
                            t.nomor_transaksi,
                            String(returId)
                        ),

                        safeDate(
                            t.tanggal ||
                            tanggal
                        ),

                        safeInteger(
                            t.sparepart_id
                        ),

                        t.custom_item ||
                            null,

                        safeString(
                            t.part_numbers_alt
                        ),

                        safeString(
                            t.merek
                        ),

                        safeString(
                            t.jenis
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan,
                            'Pcs'
                        ),

                        safeNumber(
                            t.jumlah_dasar,
                            safeNumber(
                                t.jumlah
                            )
                        ),

                        safeNumber(
                            t.harga_satuan
                        ),

                        safeString(
                            t.tujuan,
                            pelanggan
                        ),

                        safeString(
                            t.keterangan
                        ),

                        safeString(
                            t.source,
                            'Retur'
                        ),

                        safeString(
                            t.kasir,
                            kasir
                        ),

                        safeString(
                            t.status_bayar,
                            'Lunas'
                        ),

                        safeString(
                            t.metode_bayar,
                            'Tukar'
                        ),

                        safeNumber(
                            t.bayar_tunai
                        ),

                        safeNumber(
                            t.transfer_amount
                        ),

                        safeNumber(
                            t.kembalian_diberikan
                        ),

                        safeNumber(
                            t.diskon
                        ),

                        t.tanggal_lunas
                            ? safeDate(
                                t.tanggal_lunas
                            )
                            : null,

                        safeString(
                            t.bank_transfer,
                            bankTransfer
                        ),

                        t.harga_master ==
                            null
                            ? null
                            : safeNumber(
                                t.harga_master
                            ),

                        safeNumber(
                            t.harga_transaksi,
                            t.harga_satuan
                        ),

                        safeString(
                            t.invoice_group,
                            String(
                                parentInvoice
                            )
                        ),

                        t.parent_transaction_id ==
                            null
                            ? null
                            : safeInteger(
                                t.parent_transaction_id,
                                null
                            ),

                        safeString(
                            t.jenis_perubahan,
                            String(
                                t.jenis
                            ).toUpperCase() ===
                            'MASUK'
                                ? 'RETUR'
                                : 'TAMBAHAN'
                        )
                    ]);

            if (
                values.length
            ) {
                await conn.query(`
                    INSERT IGNORE INTO transactions
                    (
                        id,
                        nomor_transaksi,
                        tanggal,
                        sparepart_id,
                        custom_item,
                        part_numbers_alt,
                        merek,
                        jenis,
                        jumlah,
                        satuan,
                        jumlah_dasar,
                        harga_satuan,
                        tujuan,
                        keterangan,
                        source,
                        kasir,
                        status_bayar,
                        metode_bayar,
                        bayar_tunai,
                        transfer_amount,
                        kembalian_diberikan,
                        diskon,
                        tanggal_lunas,
                        bank_transfer,
                        harga_master,
                        harga_transaksi,
                        invoice_group,
                        parent_transaction_id,
                        jenis_perubahan
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        if (
            taxRecords.length
        ) {
            const values =
                taxRecords
                    .filter(
                        t =>
                            t &&
                            t.tax_id
                    )
                    .map(t => [
                        safeString(
                            t.tax_id
                        ),

                        safeInteger(
                            t.trx_id,
                            0
                        ),

                        safeDate(
                            t.tanggal ||
                            tanggal
                        ),

                        safeString(
                            t.nomor_transaksi,
                            String(returId)
                        ),

                        safeString(
                            t.part_number
                        ),

                        safeString(
                            t.nama
                        ),

                        safeString(
                            t.kategori
                        ),

                        safeString(
                            t.merek
                        ),

                        safeString(
                            t.status_bayar,
                            'Lunas'
                        ),

                        safeString(
                            t.pelanggan,
                            pelanggan
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan,
                            'Pcs'
                        ),

                        safeNumber(
                            t.harga_satuan
                        ),

                        safeNumber(
                            t.subtotal
                        ),

                        safeNumber(
                            t.persentase_pajak
                        ),

                        safeNumber(
                            t.nilai_pajak
                        ),

                        safeString(
                            t.kode_pajak
                        ),

                        safeString(
                            t.invoice_group,
                            String(
                                parentInvoice
                            )
                        ),

                        safeString(
                            t.jenis_perubahan,
                            'TAMBAHAN'
                        )
                    ]);

            if (
                values.length
            ) {
                await conn.query(`
                    INSERT IGNORE INTO tax_records
                    (
                        tax_id,
                        trx_id,
                        tanggal,
                        nomor_transaksi,
                        part_number,
                        nama,
                        kategori,
                        merek,
                        status_bayar,
                        pelanggan,
                        jumlah,
                        satuan,
                        harga_satuan,
                        subtotal,
                        persentase_pajak,
                        nilai_pajak,
                        kode_pajak,
                        invoice_group,
                        jenis_perubahan
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        await conn.commit();

        invalidateDataCache();

        return res.json({
            success: true,
            message:
                'Retur berhasil disimpan ke server',
            returId:
                String(returId),
            parentInvoice:
                String(parentInvoice),
            refundAmount:
                actualRefund,
            exchangeAmount:
                actualAdditional,
            netDifference
        });
    } catch (error) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (e) {}
        }

        console.error(
            '[RETUR] ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error:
                'Gagal menyimpan retur: ' +
                error.message
        });
    } finally {
        if (conn) {
            conn.release();
        }
    }
});

// ============================================================
// INVOICE / LAPORAN SERVER-SIDE
// ============================================================

app.get('/api/invoice/:invoice', async (req, res) => {
    const invoice =
        safeString(
            req.params.invoice
        ).trim();

    if (!invoice) {
        return res.status(400).json({
            success: false,
            error:
                'Nomor invoice tidak valid'
        });
    }

    try {
        const [transactions] =
            await pool.query(`
                SELECT *
                FROM transactions
                WHERE nomor_transaksi = ?
                ORDER BY tanggal ASC, id ASC
            `, [
                invoice
            ]);

        const [returRows] =
            await pool.query(`
                SELECT *
                FROM retur_records
                WHERE parent_invoice = ?
                ORDER BY tanggal ASC, id ASC
            `, [
                invoice
            ]);

        const [taxRows] =
            await pool.query(`
                SELECT *
                FROM tax_records
                WHERE nomor_transaksi = ?
                   OR invoice_group = ?
                ORDER BY tanggal ASC, tax_id ASC
            `, [
                invoice,
                invoice
            ]);

        if (
            !transactions.length &&
            !returRows.length
        ) {
            return res.status(404).json({
                success: false,
                error:
                    'Invoice tidak ditemukan'
            });
        }

        const [spareparts] =
            await pool.query(`
                SELECT *
                FROM spareparts
            `);

        const spMap =
            new Map(
                spareparts.map(
                    sp => [
                        Number(sp.id),
                        sp
                    ]
                )
            );

        const tx =
            transactions.map(
                normalizeTransactionForClient
            );

        const rr =
            returRows.map(
                r => ({
                    ...r,

                    items:
                        Array.isArray(
                            safeJSON(
                                r.items,
                                []
                            )
                        )
                            ? safeJSON(
                                r.items,
                                []
                            )
                            : [],

                    exchange_items:
                        Array.isArray(
                            safeJSON(
                                r.exchange_items,
                                []
                            )
                        )
                            ? safeJSON(
                                r.exchange_items,
                                []
                            )
                            : [],

                    metode_bayar:
                        safeString(
                            r.metode_bayar,
                            'Tunai'
                        ),

                    bank_transfer:
                        safeString(
                            r.bank_transfer
                        ),

                    refund_amount:
                        safeNumber(
                            r.refund_amount
                        ),

                    exchange_amount:
                        safeNumber(
                            r.exchange_amount
                        )
                })
            );

        const enriched =
            tx.map(t => {
                const sp =
                    t.sparepart_id ==
                        null
                        ? null
                        : spMap.get(
                            Number(
                                t.sparepart_id
                            )
                        );

                return {
                    ...t,

                    nama:
                        t.custom_item ||
                        sp?.nama ||
                        'Barang Dihapus',

                    kode:
                        sp?.kode ||
                        '-',

                    merek:
                        sp?.merek ||
                        t.merek ||
                        '-',

                    part_number:
                        sp?.part_number ||
                        '-',

                    part_numbers_alt:
                        sp?.part_numbers_alt ||
                        t.part_numbers_alt ||
                        '-',

                    satuan:
                        t.satuan ||
                        sp?.satuan ||
                        '-',

                    satuan_alt:
                        sp?.satuan_alt ||
                        '-',

                    harga_jual:
                        safeNumber(
                            sp?.harga_jual
                        ),

                    harga_jual_alt:
                        safeNumber(
                            sp?.harga_jual_alt
                        ),

                    isi_satuan_alt:
                        safeNumber(
                            sp?.isi_satuan_alt,
                            1
                        ),

                    kode_pajak:
                        sp?.kode_pajak ||
                        '-',

                    pajak_status:
                        sp?.pajak_status ||
                        'Non Pajak'
                };
            });

        const aggregate =
            buildInvoiceAggregate(
                enriched,
                rr,
                taxRows,
                invoice
            );

        aggregate.barang_awal =
            aggregate.barang_awal.map(
                i => {
                    const sp =
                        i.sparepart_id ==
                            null
                            ? null
                            : spMap.get(
                                Number(
                                    i.sparepart_id
                                )
                            );

                    return {
                        ...i,

                        nama:
                            i.nama ||
                            sp?.nama ||
                            'Barang Dihapus',

                        kode:
                            sp?.kode ||
                            '-',

                        merek:
                            i.merek ||
                            sp?.merek ||
                            '-',

                        part_number:
                            sp?.part_number ||
                            '-',

                        part_numbers_alt:
                            i.part_numbers_alt ||
                            sp?.part_numbers_alt ||
                            '-',

                        kode_pajak:
                            sp?.kode_pajak ||
                            '-',

                        pajak_status:
                            sp?.pajak_status ||
                            'Non Pajak'
                    };
                }
            );

        return res.json({
            success: true,

            invoice:
                aggregate,

            transactions:
                enriched,

            returRecords:
                rr,

            taxRecords:
                taxRows
        });
    } catch (error) {
        console.error(
            'GET INVOICE ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/reports/cash', async (req, res) => {
    const start =
        req.query.start
            ? new Date(
                String(
                    req.query.start
                ) +
                'T00:00:00'
            )
            : new Date(0);

    const end =
        req.query.end
            ? new Date(
                String(
                    req.query.end
                ) +
                'T23:59:59.999'
            )
            : new Date(
                '2999-12-31T23:59:59.999'
            );

    if (
        Number.isNaN(
            start.getTime()
        ) ||
        Number.isNaN(
            end.getTime()
        )
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Rentang tanggal tidak valid'
        });
    }

    try {
        const [transactions] =
            await pool.query(`
                SELECT *
                FROM transactions
                WHERE tanggal BETWEEN ? AND ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const [expenses] =
            await pool.query(`
                SELECT *
                FROM cash_expenses
                WHERE tanggal BETWEEN ? AND ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const [inflows] =
            await pool.query(`
                SELECT *
                FROM cash_inflows
                WHERE tanggal BETWEEN ? AND ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const [returs] =
            await pool.query(`
                SELECT *
                FROM retur_records
                WHERE tanggal BETWEEN ? AND ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const sales =
            transactions.filter(
                t =>
                    t.source ===
                        'Kasir' &&
                    t.status_bayar ===
                        'Lunas'
            );

        const invoiceMap =
            new Map();

        sales.forEach(
            t => {
                const inv =
                    String(
                        t.nomor_transaksi ||
                        ''
                    );

                if (!inv) {
                    return;
                }

                if (
                    !invoiceMap.has(
                        inv
                    )
                ) {
                    invoiceMap.set(
                        inv,
                        {
                            cash: 0,
                            transfer: 0,
                            bank:
                                t.bank_transfer ||
                                '',
                            change: 0,
                            method:
                                t.metode_bayar ||
                                'Tunai',
                            tanggal:
                                t.tanggal,
                            kasir:
                                t.kasir ||
                                '-'
                        }
                    );
                }

                const row =
                    invoiceMap.get(
                        inv
                    );

                row.cash =
                    Math.max(
                        row.cash,
                        safeNumber(
                            t.bayar_tunai
                        )
                    );

                row.transfer =
                    Math.max(
                        row.transfer,
                        safeNumber(
                            t.transfer_amount,
                            t.metode_bayar ===
                                'Transfer'
                                ? safeNumber(
                                    t.harga_satuan
                                ) *
                                safeNumber(
                                    t.jumlah
                                )
                                : 0
                        )
                    );

                row.change =
                    Math.max(
                        row.change,
                        safeNumber(
                            t.kembalian_diberikan
                        )
                    );

                if (
                    t.bank_transfer
                ) {
                    row.bank =
                        t.bank_transfer;
                }
            }
        );

        let penjualanCash = 0;
        let penjualanTransfer = 0;
        let kembalian = 0;

        const bankMap = {};

        invoiceMap.forEach(
            row => {
                const cashNet =
                    Math.max(
                        0,
                        row.cash -
                        row.change
                    );

                penjualanCash +=
                    cashNet;

                penjualanTransfer +=
                    row.transfer;

                kembalian +=
                    row.change;

                if (
                    row.transfer > 0
                ) {
                    const bank =
                        row.bank ||
                        '-';

                    if (
                        !bankMap[
                            bank
                        ]
                    ) {
                        bankMap[
                            bank
                        ] = {
                            penjualan: 0,
                            tambahan: 0,
                            refund: 0,
                            net: 0
                        };
                    }

                    bankMap[
                        bank
                    ].penjualan +=
                        row.transfer;
                }
            }
        );

        let returCash = 0;
        let returTransfer = 0;
        let tambahanCash = 0;
        let tambahanTransfer = 0;

        returs.forEach(
            r => {
                const returned =
                    (
                        Array.isArray(
                            r.items
                        )
                            ? r.items
                            : []
                    ).reduce(
                        (a, i) =>
                            a +
                            itemSubtotal(i),
                        0
                    );

                const exchanged =
                    (
                        Array.isArray(
                            r.exchange_items
                        )
                            ? r.exchange_items
                            : []
                    ).reduce(
                        (a, i) =>
                            a +
                            itemSubtotal(i),
                        0
                    );

                const refund =
                    safeNumber(
                        r.refund_amount
                    ) > 0
                        ? safeNumber(
                            r.refund_amount
                        )
                        : Math.max(
                            0,
                            returned -
                            exchanged
                        );

                const addition =
                    safeNumber(
                        r.exchange_amount
                    ) > 0
                        ? safeNumber(
                            r.exchange_amount
                        )
                        : Math.max(
                            0,
                            exchanged -
                            returned
                        );

                const method =
                    String(
                        r.metode_bayar ||
                        'Tunai'
                    ).toLowerCase();

                if (
                    method ===
                    'transfer'
                ) {
                    returTransfer +=
                        refund;

                    tambahanTransfer +=
                        addition;

                    const bank =
                        r.bank_transfer ||
                        '-';

                    if (
                        !bankMap[
                            bank
                        ]
                    ) {
                        bankMap[
                            bank
                        ] = {
                            penjualan: 0,
                            tambahan: 0,
                            refund: 0,
                            net: 0
                        };
                    }

                    bankMap[
                        bank
                    ].refund +=
                        refund;

                    bankMap[
                        bank
                    ].tambahan +=
                        addition;
                } else {
                    returCash +=
                        refund;

                    tambahanCash +=
                        addition;
                }
            }
        );

        const totalInflows =
            inflows.reduce(
                (s, x) =>
                    s +
                    safeNumber(
                        x.jumlah
                    ),
                0
            );

        const totalExpenses =
            expenses.reduce(
                (s, x) =>
                    s +
                    safeNumber(
                        x.jumlah
                    ),
                0
            );

        const [settingsRows] =
            await pool.query(`
                SELECT kas_awal
                FROM app_settings
                WHERE id = 1
                LIMIT 1
            `);

        const kasAwal =
            safeNumber(
                settingsRows[0]
                    ?.kas_awal
            );

        Object.values(
            bankMap
        ).forEach(
            b => {
                b.net =
                    b.penjualan +
                    b.tambahan -
                    b.refund;
            }
        );

        return res.json({
            success: true,

            periode: {
                start:
                    start.toISOString(),
                end:
                    end.toISOString()
            },

            saldoAwal:
                kasAwal,

            penjualanCash,

            tambahanCash,

            pemasukanLain:
                totalInflows,

            returCash,

            pengeluaranKas:
                totalExpenses,

            saldoAkhirLaci:
                kasAwal +
                penjualanCash +
                tambahanCash +
                totalInflows -
                returCash -
                totalExpenses,

            transfer: {
                penjualan:
                    penjualanTransfer,

                tambahan:
                    tambahanTransfer,

                refund:
                    returTransfer,

                total:
                    penjualanTransfer +
                    tambahanTransfer -
                    returTransfer,

                bank:
                    bankMap
            },

            rincian: {
                transaksi:
                    [
                        ...invoiceMap.entries()
                    ].map(
                        ([
                            invoice,
                            v
                        ]) => ({
                            invoice,
                            ...v
                        })
                    ),

                expenses,

                inflows,

                returs
            }
        });
    } catch (error) {
        console.error(
            'GET CASH REPORT ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/reports/shift', async (req, res) => {
    const startValue =
        req.query.start ||
        req.query.activeShiftStart;

    const start =
        startValue
            ? new Date(
                Number(startValue)
                    ? Number(startValue)
                    : String(
                        startValue
                    )
            )
            : new Date();

    const end =
        req.query.end
            ? new Date(
                Number(
                    req.query.end
                )
                    ? Number(
                        req.query.end
                    )
                    : String(
                        req.query.end
                    )
            )
            : new Date();

    if (
        Number.isNaN(
            start.getTime()
        ) ||
        Number.isNaN(
            end.getTime()
        )
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Waktu shift tidak valid'
        });
    }

    try {
        const [transactions] =
            await pool.query(`
                SELECT *
                FROM transactions
                WHERE tanggal >= ?
                  AND tanggal <= ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const [expenses] =
            await pool.query(`
                SELECT *
                FROM cash_expenses
                WHERE tanggal >= ?
                  AND tanggal <= ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const [inflows] =
            await pool.query(`
                SELECT *
                FROM cash_inflows
                WHERE tanggal >= ?
                  AND tanggal <= ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const [returs] =
            await pool.query(`
                SELECT *
                FROM retur_records
                WHERE tanggal >= ?
                  AND tanggal <= ?
                ORDER BY tanggal ASC, id ASC
            `, [
                start,
                end
            ]);

        const invoiceMap =
            new Map();

        transactions
            .filter(
                t =>
                    t.source ===
                        'Kasir' &&
                    t.status_bayar ===
                        'Lunas'
            )
            .forEach(
                t => {
                    const inv =
                        String(
                            t.nomor_transaksi ||
                            ''
                        );

                    if (!inv) {
                        return;
                    }

                    if (
                        !invoiceMap.has(
                            inv
                        )
                    ) {
                        invoiceMap.set(
                            inv,
                            {
                                invoice:
                                    inv,

                                tanggal:
                                    t.tanggal,

                                kasir:
                                    t.kasir ||
                                    '-',

                                metode_bayar:
                                    t.metode_bayar ||
                                    'Tunai',

                                bank_transfer:
                                    t.bank_transfer ||
                                    '-',

                                cash: 0,

                                transfer: 0,

                                change: 0
                            }
                        );
                    }

                    const row =
                        invoiceMap.get(
                            inv
                        );

                    row.cash =
                        Math.max(
                            row.cash,
                            safeNumber(
                                t.bayar_tunai
                            )
                        );

                    row.transfer =
                        Math.max(
                            row.transfer,
                            safeNumber(
                                t.transfer_amount,
                                t.metode_bayar ===
                                    'Transfer'
                                    ? safeNumber(
                                        t.harga_satuan
                                    ) *
                                    safeNumber(
                                        t.jumlah
                                    )
                                    : 0
                            )
                        );

                    row.change =
                        Math.max(
                            row.change,
                            safeNumber(
                                t.kembalian_diberikan
                            )
                        );
                }
            );

        const penjualanCash =
            [
                ...invoiceMap.values()
            ].reduce(
                (s, x) =>
                    s +
                    Math.max(
                        0,
                        x.cash -
                        x.change
                    ),
                0
            );

        const penjualanTransfer =
            [
                ...invoiceMap.values()
            ].reduce(
                (s, x) =>
                    s +
                    x.transfer,
                0
            );

        const pengeluaran =
            expenses.reduce(
                (s, x) =>
                    s +
                    safeNumber(
                        x.jumlah
                    ),
                0
            );

        const pemasukanLain =
            inflows.reduce(
                (s, x) =>
                    s +
                    safeNumber(
                        x.jumlah
                    ),
                0
            );

        let returCash = 0;
        let returTransfer = 0;
        let tambahanCash = 0;
        let tambahanTransfer = 0;

        returs.forEach(
            r => {
                const returned =
                    (
                        Array.isArray(
                            r.items
                        )
                            ? r.items
                            : []
                    ).reduce(
                        (a, i) =>
                            a +
                            itemSubtotal(i),
                        0
                    );

                const exchanged =
                    (
                        Array.isArray(
                            r.exchange_items
                        )
                            ? r.exchange_items
                            : []
                    ).reduce(
                        (a, i) =>
                            a +
                            itemSubtotal(i),
                        0
                    );

                const refund =
                    safeNumber(
                        r.refund_amount
                    ) > 0
                        ? safeNumber(
                            r.refund_amount
                        )
                        : Math.max(
                            0,
                            returned -
                            exchanged
                        );

                const addition =
                    safeNumber(
                        r.exchange_amount
                    ) > 0
                        ? safeNumber(
                            r.exchange_amount
                        )
                        : Math.max(
                            0,
                            exchanged -
                            returned
                        );

                if (
                    String(
                        r.metode_bayar ||
                        'Tunai'
                    ).toLowerCase() ===
                    'transfer'
                ) {
                    returTransfer +=
                        refund;

                    tambahanTransfer +=
                        addition;
                } else {
                    returCash +=
                        refund;

                    tambahanCash +=
                        addition;
                }
            }
        );

        const settingsRows =
            await pool.query(`
                SELECT
                    kas_awal,
                    active_shift_start
                FROM app_settings
                WHERE id = 1
                LIMIT 1
            `).then(
                ([r]) => r
            );

        const saldoAwal =
            safeNumber(
                settingsRows[0]
                    ?.kas_awal
            );

        const saldoAkhir =
            saldoAwal +
            penjualanCash +
            tambahanCash +
            pemasukanLain -
            returCash -
            pengeluaran;

        return res.json({
            success: true,

            shift: {
                kasir:
                    req.query.kasir ||
                    '-',

                tanggal:
                    start
                        .toISOString()
                        .slice(
                            0,
                            10
                        ),

                jam_mulai:
                    start.toISOString(),

                jam_selesai:
                    end.toISOString(),

                saldo_awal_laci:
                    saldoAwal,

                pemasukan: {
                    penjualan_cash:
                        penjualanCash,

                    tambahan_cash:
                        tambahanCash,

                    pemasukan_lain:
                        pemasukanLain
                },

                pengurangan: {
                    retur_cash:
                        returCash,

                    pengeluaran:
                        pengeluaran,

                    koreksi: 0
                },

                saldo_akhir_laci:
                    saldoAkhir,

                transfer: {
                    penjualan:
                        penjualanTransfer,

                    tambahan:
                        tambahanTransfer,

                    refund:
                        returTransfer,

                    total:
                        penjualanTransfer +
                        tambahanTransfer -
                        returTransfer
                },

                transaksi:
                    [
                        ...invoiceMap.values()
                    ],

                returs,

                expenses,

                inflows
            }
        });
    } catch (error) {
        console.error(
            'GET SHIFT REPORT ERROR:',
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 7. HAPUS INVOICE
// ============================================================

app.post('/api/transaction/delete-invoice', async (req, res) => {
    const trxId =
        req.body?.trxId;

    if (
        trxId === undefined ||
        trxId === null ||
        String(
            trxId
        ).trim() === ''
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Nomor invoice tidak valid'
        });
    }

    try {
        const [returs] =
            await pool.query(`
                SELECT id
                FROM retur_records
                WHERE parent_invoice = ?
            `, [
                String(trxId)
            ]);

        await pool.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [
            String(trxId)
        ]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [
            String(trxId)
        ]);

        if (
            returs.length > 0
        ) {
            for (
                const r of returs
            ) {
                await pool.query(`
                    DELETE FROM transactions
                    WHERE nomor_transaksi = ?
                `, [
                    String(r.id)
                ]);

                await pool.query(`
                    DELETE FROM tax_records
                    WHERE nomor_transaksi = ?
                `, [
                    String(r.id)
                ]);
            }
        }

        await pool.query(`
            DELETE FROM retur_records
            WHERE parent_invoice = ?
        `, [
            String(trxId)
        ]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Invoice & retur berhasil dihapus dari server'
        });
    } catch (error) {
        console.error(
            'Error hapus invoice:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 8. HAPUS RETUR
// ============================================================

app.post('/api/transaction/delete-retur', async (req, res) => {
    const returId =
        req.body?.returId;

    if (
        returId === undefined ||
        returId === null ||
        String(
            returId
        ).trim() === ''
    ) {
        return res.status(400).json({
            success: false,
            error:
                'ID retur tidak valid'
        });
    }

    try {
        await pool.query(`
            DELETE FROM transactions
            WHERE nomor_transaksi = ?
        `, [
            String(returId)
        ]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE nomor_transaksi = ?
        `, [
            String(returId)
        ]);

        await pool.query(`
            DELETE FROM retur_records
            WHERE id = ?
        `, [
            String(returId)
        ]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Retur berhasil dihapus dari server'
        });
    } catch (error) {
        console.error(
            'Error hapus retur:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 9. HAPUS TRANSAKSI
// ============================================================

app.post('/api/transaction/delete', async (req, res) => {
    const cleanId =
        safeInteger(
            req.body?.id
        );

    if (
        cleanId === null
    ) {
        return res.status(400).json({
            success: false,
            error:
                'ID transaksi tidak valid'
        });
    }

    try {
        await pool.query(`
            DELETE FROM transactions
            WHERE id = ?
        `, [
            cleanId
        ]);

        await pool.query(`
            DELETE FROM tax_records
            WHERE trx_id = ?
        `, [
            cleanId
        ]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Transaksi berhasil dihapus dari server'
        });
    } catch (error) {
        console.error(
            'Error hapus transaksi:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 10. EDIT STRUK
// ============================================================

app.put('/api/transaction/edit-struk', async (req, res) => {
    const invoice =
        req.body?.invoice;

    const items =
        Array.isArray(
            req.body?.items
        )
            ? req.body.items
            : [];

    const diskon =
        req.body?.diskon;

    if (
        invoice === undefined ||
        invoice === null ||
        String(
            invoice
        ).trim() === ''
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Invoice tidak valid'
        });
    }

    const conn =
        await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [trxRows] =
            await conn.query(`
                SELECT
                    id,
                    nomor_transaksi
                FROM transactions
                WHERE nomor_transaksi = ?
                ORDER BY id ASC
            `, [
                String(invoice)
            ]);

        if (
            trxRows.length === 0
        ) {
            await conn.rollback();

            return res.status(404).json({
                success: false,
                error:
                    'Invoice tidak ditemukan di database'
            });
        }

        for (
            let i = 0;
            i < trxRows.length;
            i++
        ) {
            if (
                i >= items.length
            ) {
                continue;
            }

            const dbId =
                safeInteger(
                    trxRows[i].id
                );

            if (
                dbId === null
            ) {
                continue;
            }

            const newHarga =
                safeNumber(
                    items[i]
                        ?.harga_satuan,
                    0
                );

            await conn.query(`
                UPDATE transactions
                SET
                    harga_satuan = ?,
                    harga_transaksi = ?
                WHERE id = ?
            `, [
                newHarga,
                newHarga,
                dbId
            ]);

            const [taxRows] =
                await conn.query(`
                    SELECT
                        tax_id,
                        jumlah,
                        persentase_pajak
                    FROM tax_records
                    WHERE trx_id = ?
                `, [
                    dbId
                ]);

            for (
                const tax of taxRows
            ) {
                const jumlah =
                    safeNumber(
                        tax.jumlah
                    );

                const persen =
                    safeNumber(
                        tax.persentase_pajak
                    );

                const newSubtotal =
                    newHarga *
                    jumlah;

                const newNilaiPajak =
                    (
                        newSubtotal *
                        persen
                    ) /
                    100;

                await conn.query(`
                    UPDATE tax_records
                    SET
                        harga_satuan = ?,
                        subtotal = ?,
                        nilai_pajak = ?
                    WHERE tax_id = ?
                `, [
                    newHarga,
                    newSubtotal,
                    newNilaiPajak,
                    String(
                        tax.tax_id
                    )
                ]);
            }
        }

        if (
            diskon !== undefined &&
            diskon !== null &&
            trxRows.length > 0
        ) {
            const firstId =
                safeInteger(
                    trxRows[0].id
                );

            if (
                firstId !== null
            ) {
                await conn.query(`
                    UPDATE transactions
                    SET diskon = ?
                    WHERE id = ?
                `, [
                    safeNumber(
                        diskon
                    ),
                    firstId
                ]);
            }
        }

        await conn.commit();

        invalidateDataCache();

        console.log(
            '[EDIT STRUK] SUCCESS:',
            invoice
        );

        res.json({
            success: true,
            message:
                'Struk berhasil diedit',
            invoice:
                String(invoice)
        });
    } catch (error) {
        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            '[EDIT STRUK] ERROR:',
            error
        );

        res.status(500).json({
            success: false,
            error:
                'Gagal menyimpan edit struk: ' +
                error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================================
// 11. PAYOFF / PELUNASAN BON
// ============================================================

app.put('/api/transactions/payoff', async (req, res) => {
    const trxId =
        req.body?.trxId;

    if (
        trxId === undefined ||
        trxId === null ||
        String(
            trxId
        ).trim() === ''
    ) {
        return res.status(400).json({
            success: false,
            error:
                'Nomor invoice tidak valid'
        });
    }

    const conn =
        await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [trxRows] =
            await conn.query(`
                SELECT *
                FROM transactions
                WHERE nomor_transaksi = ?
            `, [
                String(trxId)
            ]);

        if (
            trxRows.length === 0
        ) {
            await conn.rollback();

            return res.status(404).json({
                success: false,
                error:
                    'Invoice tidak ditemukan'
            });
        }

        const isAlreadyLunas =
            trxRows.every(
                t =>
                    t.status_bayar ===
                    'Lunas'
            );

        if (
            isAlreadyLunas
        ) {
            await conn.rollback();

            return res.status(400).json({
                success: false,
                error:
                    'Invoice sudah lunas'
            });
        }

        const total =
            trxRows.reduce(
                (sum, t) =>
                    sum +
                    (
                        safeNumber(
                            t.harga_satuan
                        ) *
                        safeNumber(
                            t.jumlah
                        )
                    ),
                0
            ) -
            safeNumber(
                trxRows[0].diskon
            );

        await conn.query(`
            UPDATE transactions
            SET
                status_bayar = 'Lunas',
                keterangan = 'Bon (Lunas)',
                tanggal_lunas = NOW()
            WHERE nomor_transaksi = ?
        `, [
            String(trxId)
        ]);

        await conn.query(`
            UPDATE tax_records
            SET status_bayar = 'Lunas'
            WHERE nomor_transaksi = ?
        `, [
            String(trxId)
        ]);

        await conn.query(`
            INSERT INTO cash_inflows
            (
                id,
                tanggal,
                jumlah,
                keterangan,
                kasir
            )
            VALUES (?, ?, ?, ?, ?)
        `, [
            Date.now(),
            new Date(),
            total,
            'Pelunasan Bon: ' +
                String(trxId),
            trxRows[0].kasir ||
                'Admin'
        ]);

        await conn.commit();

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Piutang berhasil dilunasi',
            total
        });
    } catch (error) {
        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            'Error payoff:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================================
// 12. EDIT TRANSAKSI MANUAL
// ============================================================

app.put('/api/transaction/:id', async (req, res) => {
    const transactionId =
        safeInteger(
            req.params.id
        );

    if (
        transactionId === null ||
        transactionId <= 0
    ) {
        return res.status(400).json({
            success: false,
            error:
                'ID transaksi tidak valid'
        });
    }

    const updatedData =
        req.body || {};

    try {
        await pool.query(`
            UPDATE transactions
            SET
                sparepart_id = ?,
                custom_item = ?,
                jenis = ?,
                jumlah = ?,
                satuan = ?,
                jumlah_dasar = ?,
                tujuan = ?,
                keterangan = ?
            WHERE id = ?
        `, [
            safeInteger(
                updatedData.sparepart_id
            ),

            updatedData.custom_item ||
                null,

            safeString(
                updatedData.jenis
            ),

            safeNumber(
                updatedData.jumlah
            ),

            safeString(
                updatedData.satuan
            ),

            safeNumber(
                updatedData.jumlah_dasar
            ),

            safeString(
                updatedData.tujuan
            ),

            safeString(
                updatedData.keterangan
            ),

            transactionId
        ]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Transaksi berhasil diupdate'
        });
    } catch (error) {
        console.error(
            'Error edit transaksi:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 13. HAPUS KAS KELUAR
// ============================================================

app.post('/api/cash-expense/delete', async (req, res) => {
    const id =
        safeInteger(
            req.body?.id
        );

    if (
        id === null
    ) {
        return res.status(400).json({
            success: false,
            error:
                'ID kas tidak valid'
        });
    }

    try {
        await pool.query(`
            DELETE FROM cash_expenses
            WHERE id = ?
        `, [
            id
        ]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Pengeluaran kas berhasil dihapus'
        });
    } catch (error) {
        console.error(
            'Error hapus cash expense:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 14. HAPUS KAS MASUK
// ============================================================

app.post('/api/cash-inflow/delete', async (req, res) => {
    const id =
        safeInteger(
            req.body?.id
        );

    if (
        id === null
    ) {
        return res.status(400).json({
            success: false,
            error:
                'ID kas tidak valid'
        });
    }

    try {
        await pool.query(`
            DELETE FROM cash_inflows
            WHERE id = ?
        `, [
            id
        ]);

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Tambahan kas berhasil dihapus'
        });
    } catch (error) {
        console.error(
            'Error hapus cash inflow:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 15. PARTNER
// ============================================================

app.post('/api/partner', async (req, res) => {
    try {
        await pool.query(
            'INSERT INTO partners SET ?',
            req.body
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Partner disimpan'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.put('/api/partner/:id', async (req, res) => {
    const id =
        safeInteger(
            req.params.id
        );

    if (
        id === null
    ) {
        return res.status(400).json({
            success: false,
            error:
                'ID partner tidak valid'
        });
    }

    try {
        await pool.query(
            'UPDATE partners SET ? WHERE id = ?',
            [
                req.body,
                id
            ]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Partner diupdate'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/partner/:id', async (req, res) => {
    const id =
        safeInteger(
            req.params.id
        );

    if (
        id === null
    ) {
        return res.status(400).json({
            success: false,
            error:
                'ID partner tidak valid'
        });
    }

    try {
        await pool.query(
            'DELETE FROM partners WHERE id = ?',
            [
                id
            ]
        );

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Partner dihapus'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================
// 16. SETTINGS
// ============================================================

app.put('/api/settings', async (req, res) => {
    const body =
        req.body || {};

    let conn;

    try {
        conn =
            await pool.getConnection();

        await conn.beginTransaction();

        const [rows] =
            await conn.query(`
                SELECT *
                FROM app_settings
                WHERE id = 1
                LIMIT 1
            `);

        const current =
            rows[0] || {};

        const kasAwal =
            body.kasAwal ===
            undefined
                ? safeNumber(
                    current.kas_awal
                )
                : safeNumber(
                    body.kasAwal
                );

        const activeShiftStart =
            body.activeShiftStart ===
            undefined
                ? (
                    current.active_shift_start ||
                    Date.now()
                )
                : body.activeShiftStart;

        const masterPajak =
            body.masterPajak ===
            undefined
                ? safeJSON(
                    current.master_pajak,
                    []
                )
                : (
                    Array.isArray(
                        body.masterPajak
                    )
                        ? body.masterPajak
                        : []
                );

        const users =
            body.users ===
            undefined
                ? safeJSON(
                    current.users,
                    []
                )
                : (
                    Array.isArray(
                        body.users
                    )
                        ? body.users
                        : []
                );

        const masterBank =
            body.masterBank ===
            undefined
                ? safeJSON(
                    current.master_bank,
                    []
                )
                : (
                    Array.isArray(
                        body.masterBank
                    )
                        ? body.masterBank
                        : []
                );

        await conn.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?,
                master_bank = ?
            WHERE id = 1
        `, [
            kasAwal,

            activeShiftStart ||
                Date.now(),

            JSON.stringify(
                masterPajak
            ),

            JSON.stringify(
                users
            ),

            JSON.stringify(
                masterBank
            )
        ]);

        const cashExpenses =
            Array.isArray(
                body.cashExpenses
            )
                ? body.cashExpenses
                : [];

        if (
            cashExpenses.length
        ) {
            const values =
                cashExpenses
                    .filter(
                        e =>
                            safeInteger(
                                e.id
                            ) !== null
                    )
                    .map(e => [
                        safeInteger(
                            e.id
                        ),
                        safeDate(
                            e.tanggal
                        ),
                        safeNumber(
                            e.jumlah
                        ),
                        safeString(
                            e.keterangan
                        ),
                        safeString(
                            e.kasir
                        )
                    ]);

            if (
                values.length
            ) {
                await conn.query(`
                    INSERT INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        tanggal =
                            VALUES(tanggal),
                        jumlah =
                            VALUES(jumlah),
                        keterangan =
                            VALUES(keterangan),
                        kasir =
                            VALUES(kasir)
                `, [
                    values
                ]);
            }
        }

        const cashInflows =
            Array.isArray(
                body.cashInflows
            )
                ? body.cashInflows
                : [];

        if (
            cashInflows.length
        ) {
            const values =
                cashInflows
                    .filter(
                        i =>
                            safeInteger(
                                i.id
                            ) !== null
                    )
                    .map(i => [
                        safeInteger(
                            i.id
                        ),
                        safeDate(
                            i.tanggal
                        ),
                        safeNumber(
                            i.jumlah
                        ),
                        safeString(
                            i.keterangan
                        ),
                        safeString(
                            i.kasir
                        )
                    ]);

            if (
                values.length
            ) {
                await conn.query(`
                    INSERT INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                    ON DUPLICATE KEY UPDATE
                        tanggal =
                            VALUES(tanggal),
                        jumlah =
                            VALUES(jumlah),
                        keterangan =
                            VALUES(keterangan),
                        kasir =
                            VALUES(kasir)
                `, [
                    values
                ]);
            }
        }

        // Frontend lama mengirim returRecords melalui settings.
        // Simpan secara idempotent agar tidak membuat retur ganda.
        if (
            Array.isArray(
                body.returRecords
            ) &&
            body.returRecords.length
        ) {
            for (
                const r of
                body.returRecords
            ) {
                if (
                    !r ||
                    r.id == null ||
                    !r.parent_invoice
                ) {
                    continue;
                }

                const ri =
                    Array.isArray(
                        r.items
                    )
                        ? r.items
                        : [];

                const ex =
                    Array.isArray(
                        r.exchange_items
                    )
                        ? r.exchange_items
                        : [];

                const rv =
                    ri.reduce(
                        (sum, i) =>
                            sum +
                            itemSubtotal(i),
                        0
                    );

                const ev =
                    ex.reduce(
                        (sum, i) =>
                            sum +
                            itemSubtotal(i),
                        0
                    );

                await conn.query(`
                    INSERT INTO retur_records
                    (
                        id,
                        parent_invoice,
                        tanggal,
                        kasir,
                        pelanggan,
                        items,
                        exchange_items,
                        metode_bayar,
                        bank_transfer,
                        refund_amount,
                        exchange_amount
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        parent_invoice =
                            VALUES(parent_invoice),
                        tanggal =
                            VALUES(tanggal),
                        kasir =
                            VALUES(kasir),
                        pelanggan =
                            VALUES(pelanggan),
                        items =
                            VALUES(items),
                        exchange_items =
                            VALUES(exchange_items),
                        metode_bayar =
                            VALUES(metode_bayar),
                        bank_transfer =
                            VALUES(bank_transfer),
                        refund_amount =
                            VALUES(refund_amount),
                        exchange_amount =
                            VALUES(exchange_amount)
                `, [
                    String(r.id),

                    String(
                        r.parent_invoice
                    ),

                    safeDate(
                        r.tanggal
                    ),

                    safeString(
                        r.kasir
                    ),

                    safeString(
                        r.pelanggan
                    ),

                    JSON.stringify(
                        ri
                    ),

                    JSON.stringify(
                        ex
                    ),

                    safeString(
                        r.metode_bayar,
                        'Tunai'
                    ),

                    safeString(
                        r.bank_transfer
                    ),

                    Math.max(
                        0,
                        rv - ev
                    ),

                    Math.max(
                        0,
                        ev - rv
                    )
                ]);
            }
        }

        await conn.commit();

        invalidateDataCache();

        return res.json({
            success: true,
            message:
                'Settings berhasil disimpan'
        });
    } catch (error) {
        if (conn) {
            try {
                await conn.rollback();
            } catch (e) {}
        }

        console.error(
            'Error settings:',
            error
        );

        return res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        if (conn) {
            conn.release();
        }
    }
});

// ============================================================
// 17. RESTORE DATA
// ============================================================

app.post('/api/restore', async (req, res) => {
    const data =
        req.body || {};

    const conn =
        await pool.getConnection();

    try {
        await conn.beginTransaction();

        // ----------------------------------------------------
        // HAPUS DATA LAMA
        // ----------------------------------------------------

        await conn.query(
            'DELETE FROM spareparts'
        );

        await conn.query(
            'DELETE FROM transactions'
        );

        await conn.query(
            'DELETE FROM partners'
        );

        await conn.query(
            'DELETE FROM cash_expenses'
        );

        await conn.query(
            'DELETE FROM cash_inflows'
        );

        await conn.query(
            'DELETE FROM tax_records'
        );

        await conn.query(
            'DELETE FROM retur_records'
        );

        // ----------------------------------------------------
        // SPAREPART
        // ----------------------------------------------------

        if (
            Array.isArray(
                data.spareparts
            ) &&
            data.spareparts.length > 0
        ) {
            const values =
                data.spareparts
                    .filter(
                        sp =>
                            safeInteger(
                                sp.id
                            ) !== null
                    )
                    .map(sp => [
                        safeInteger(
                            sp.id
                        ),
                        safeString(
                            sp.kode
                        ),
                        safeString(
                            sp.part_number
                        ),
                        safeString(
                            sp.part_numbers_alt
                        ),
                        safeString(
                            sp.nama
                        ),
                        safeString(
                            sp.kategori,
                            'Umum'
                        ),
                        safeString(
                            sp.merek
                        ),
                        safeString(
                            sp.satuan,
                            'Pcs'
                        ),
                        safeNumber(
                            sp.stok_min
                        ),
                        safeNumber(
                            sp.stok_awal
                        ),
                        safeNumber(
                            sp.harga_beli
                        ),
                        safeNumber(
                            sp.harga_jual
                        ),
                        safeString(
                            sp.satuan_alt
                        ),
                        safeNumber(
                            sp.isi_satuan_alt
                        ),
                        safeNumber(
                            sp.harga_jual_alt
                        ),
                        safeString(
                            sp.pajak_status,
                            'Non Pajak'
                        ),
                        safeString(
                            sp.kode_pajak
                        ),
                        safeString(
                            sp.keterangan
                        )
                    ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {
                await conn.query(`
                    INSERT INTO spareparts
                    (
                        id,
                        kode,
                        part_number,
                        part_numbers_alt,
                        nama,
                        kategori,
                        merek,
                        satuan,
                        stok_min,
                        stok_awal,
                        harga_beli,
                        harga_jual,
                        satuan_alt,
                        isi_satuan_alt,
                        harga_jual_alt,
                        pajak_status,
                        kode_pajak,
                        keterangan
                    )
                    VALUES ?
                `, [
                    values.slice(
                        i,
                        i + 500
                    )
                ]);
            }
        }

        // ----------------------------------------------------
        // TRANSACTIONS
        // ----------------------------------------------------

        if (
            Array.isArray(
                data.transactions
            ) &&
            data.transactions.length > 0
        ) {
            const values =
                data.transactions
                    .filter(
                        t =>
                            safeInteger(
                                t.id
                            ) !== null
                    )
                    .map(t => [
                        safeInteger(
                            t.id
                        ),

                        safeString(
                            t.nomor_transaksi
                        ),

                        safeDate(
                            t.tanggal
                        ),

                        safeInteger(
                            t.sparepart_id
                        ),

                        t.custom_item ||
                            null,

                        safeString(
                            t.part_numbers_alt
                        ),

                        safeString(
                            t.merek
                        ),

                        safeString(
                            t.jenis
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan
                        ),

                        safeNumber(
                            t.jumlah_dasar
                        ),

                        safeNumber(
                            t.harga_satuan
                        ),

                        safeString(
                            t.tujuan
                        ),

                        safeString(
                            t.keterangan
                        ),

                        safeString(
                            t.source
                        ),

                        safeString(
                            t.kasir
                        ),

                        safeString(
                            t.status_bayar
                        ),

                        safeString(
                            t.metode_bayar
                        ),

                        safeNumber(
                            t.bayar_tunai
                        ),

                        safeNumber(
                            t.transfer_amount
                        ),

                        safeNumber(
                            t.kembalian_diberikan
                        ),

                        safeNumber(
                            t.diskon
                        ),

                        t.tanggal_lunas
                            ? safeDate(
                                t.tanggal_lunas
                            )
                            : null
                    ]);

            for (
                let i = 0;
                i < values.length;
                i += 500
            ) {
                await conn.query(`
                    INSERT INTO transactions
                    (
                        id,
                        nomor_transaksi,
                        tanggal,
                        sparepart_id,
                        custom_item,
                        part_numbers_alt,
                        merek,
                        jenis,
                        jumlah,
                        satuan,
                        jumlah_dasar,
                        harga_satuan,
                        tujuan,
                        keterangan,
                        source,
                        kasir,
                        status_bayar,
                        metode_bayar,
                        bayar_tunai,
                        transfer_amount,
                        kembalian_diberikan,
                        diskon,
                        tanggal_lunas
                    )
                    VALUES ?
                `, [
                    values.slice(
                        i,
                        i + 500
                    )
                ]);
            }
        }

        // ----------------------------------------------------
        // PARTNERS
        // ----------------------------------------------------

        if (
            Array.isArray(
                data.partners
            ) &&
            data.partners.length > 0
        ) {
            const values =
                data.partners
                    .filter(
                        p =>
                            safeInteger(
                                p.id
                            ) !== null
                    )
                    .map(p => [
                        safeInteger(
                            p.id
                        ),
                        safeString(
                            p.nama
                        ),
                        safeString(
                            p.tipe
                        ),
                        safeString(
                            p.telp
                        ),
                        safeString(
                            p.alamat
                        )
                    ]);

            if (
                values.length > 0
            ) {
                await conn.query(`
                    INSERT INTO partners
                    (
                        id,
                        nama,
                        tipe,
                        telp,
                        alamat
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        // ----------------------------------------------------
        // CASH EXPENSES
        // ----------------------------------------------------

        if (
            Array.isArray(
                data.cashExpenses
            ) &&
            data.cashExpenses.length > 0
        ) {
            const values =
                data.cashExpenses
                    .filter(
                        e =>
                            safeInteger(
                                e.id
                            ) !== null
                    )
                    .map(e => [
                        safeInteger(
                            e.id
                        ),
                        safeDate(
                            e.tanggal
                        ),
                        safeNumber(
                            e.jumlah
                        ),
                        safeString(
                            e.keterangan
                        ),
                        safeString(
                            e.kasir
                        )
                    ]);

            if (
                values.length > 0
            ) {
                await conn.query(`
                    INSERT INTO cash_expenses
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        // ----------------------------------------------------
        // CASH INFLOWS
        // ----------------------------------------------------

        if (
            Array.isArray(
                data.cashInflows
            ) &&
            data.cashInflows.length > 0
        ) {
            const values =
                data.cashInflows
                    .filter(
                        i =>
                            safeInteger(
                                i.id
                            ) !== null
                    )
                    .map(i => [
                        safeInteger(
                            i.id
                        ),
                        safeDate(
                            i.tanggal
                        ),
                        safeNumber(
                            i.jumlah
                        ),
                        safeString(
                            i.keterangan
                        ),
                        safeString(
                            i.kasir
                        )
                    ]);

            if (
                values.length > 0
            ) {
                await conn.query(`
                    INSERT INTO cash_inflows
                    (
                        id,
                        tanggal,
                        jumlah,
                        keterangan,
                        kasir
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        // ----------------------------------------------------
        // TAX RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(
                data.taxRecords
            ) &&
            data.taxRecords.length > 0
        ) {
            const values =
                data.taxRecords
                    .filter(
                        t =>
                            t &&
                            t.tax_id
                    )
                    .map(t => [
                        safeString(
                            t.tax_id
                        ),

                        safeInteger(
                            t.trx_id,
                            0
                        ),

                        safeDate(
                            t.tanggal
                        ),

                        safeString(
                            t.nomor_transaksi
                        ),

                        safeString(
                            t.part_number
                        ),

                        safeString(
                            t.nama
                        ),

                        safeString(
                            t.kategori
                        ),

                        safeString(
                            t.merek
                        ),

                        safeString(
                            t.status_bayar
                        ),

                        safeString(
                            t.pelanggan
                        ),

                        safeNumber(
                            t.jumlah
                        ),

                        safeString(
                            t.satuan
                        ),

                        safeNumber(
                            t.harga_satuan
                        ),

                        safeNumber(
                            t.subtotal
                        ),

                        safeNumber(
                            t.persentase_pajak
                        ),

                        safeNumber(
                            t.nilai_pajak
                        )
                    ]);

            if (
                values.length > 0
            ) {
                await conn.query(`
                    INSERT INTO tax_records
                    (
                        tax_id,
                        trx_id,
                        tanggal,
                        nomor_transaksi,
                        part_number,
                        nama,
                        kategori,
                        merek,
                        status_bayar,
                        pelanggan,
                        jumlah,
                        satuan,
                        harga_satuan,
                        subtotal,
                        persentase_pajak,
                        nilai_pajak
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        // ----------------------------------------------------
        // RETUR RECORDS
        // ----------------------------------------------------

        if (
            Array.isArray(
                data.returRecords
            ) &&
            data.returRecords.length > 0
        ) {
            const values =
                data.returRecords
                    .filter(
                        r =>
                            r &&
                            r.id !==
                                undefined &&
                            r.id !==
                                null &&
                            String(
                                r.id
                            ).trim() !==
                                ''
                    )
                    .map(r => {
                        const items =
                            Array.isArray(
                                r.items
                            )
                                ? r.items
                                : [];

                        const exchange =
                            Array.isArray(
                                r.exchange_items
                            )
                                ? r.exchange_items
                                : [];

                        const returned =
                            items.reduce(
                                (sum, i) =>
                                    sum +
                                    itemSubtotal(i),
                                0
                            );

                        const exchanged =
                            exchange.reduce(
                                (sum, i) =>
                                    sum +
                                    itemSubtotal(i),
                                0
                            );

                        return [
                            String(
                                r.id
                            ),

                            safeString(
                                r.parent_invoice
                            ),

                            safeDate(
                                r.tanggal
                            ),

                            safeString(
                                r.kasir
                            ),

                            safeString(
                                r.pelanggan
                            ),

                            JSON.stringify(
                                items
                            ),

                            JSON.stringify(
                                exchange
                            ),

                            safeString(
                                r.metode_bayar,
                                'Tunai'
                            ),

                            safeString(
                                r.bank_transfer
                            ),

                            Math.max(
                                0,
                                returned -
                                exchanged
                            ),

                            Math.max(
                                0,
                                exchanged -
                                returned
                            )
                        ];
                    });

            if (
                values.length > 0
            ) {
                await conn.query(`
                    INSERT INTO retur_records
                    (
                        id,
                        parent_invoice,
                        tanggal,
                        kasir,
                        pelanggan,
                        items,
                        exchange_items,
                        metode_bayar,
                        bank_transfer,
                        refund_amount,
                        exchange_amount
                    )
                    VALUES ?
                `, [
                    values
                ]);
            }
        }

        // ----------------------------------------------------
        // SETTINGS
        // ----------------------------------------------------

        await conn.query(`
            UPDATE app_settings
            SET
                kas_awal = ?,
                active_shift_start = ?,
                master_pajak = ?,
                users = ?,
                master_bank = ?
            WHERE id = 1
        `, [
            safeNumber(
                data.kasAwal
            ),

            data.activeShiftStart ||
                Date.now(),

            JSON.stringify(
                Array.isArray(
                    data.masterPajak
                )
                    ? data.masterPajak
                    : []
            ),

            JSON.stringify(
                Array.isArray(
                    data.users
                )
                    ? data.users
                    : []
            ),

            JSON.stringify(
                Array.isArray(
                    data.masterBank
                )
                    ? data.masterBank
                    : []
            )
        ]);

        await syncExtendedRows(
            conn,
            data
        );

        await conn.commit();

        invalidateDataCache();

        res.json({
            success: true,
            message:
                'Restore data berhasil!'
        });
    } catch (error) {
        try {
            await conn.rollback();
        } catch (e) {}

        console.error(
            'Error restore:',
            error
        );

        res.status(500).json({
            success: false,
            error: error.message
        });
    } finally {
        conn.release();
    }
});

// ============================================================
// SERVER
// ============================================================

const PORT =
    process.env.PORT ||
    3000;

app.listen(
    PORT,
    () => {
        console.log(
            `Server berjalan di port ${PORT}`
        );
    }
);
