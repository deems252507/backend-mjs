const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
// ENDPOINT TEST UNTUK MENGECEK VERSI SERVER
app.get('/api/test', (req, res) => {
    res.json({ status: "OK", message: "Server baru berhasil di-deploy!" });
});

// KREDENSIAL DATABASE CLEVER CLOUD
const pool = mysql.createPool({
    host: 'b7fgoctdsrijlfhczppz-mysql.services.clever-cloud.com',
    user: 'uks2krvuygsynrco',
    password: 'fWwkTbshbBANrTGMj8Aq',
    database: 'b7fgoctdsrijlfhczppz',
    waitForConnections: true,
    connectionLimit: 3, 
    queueLimit: 0
});

// 1. INISIALISASI TABEL
app.get('/api/init', async (req, res) => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS spareparts (
            id BIGINT PRIMARY KEY, kode VARCHAR(50), part_number VARCHAR(255), part_numbers_alt TEXT,
            nama VARCHAR(500), kategori VARCHAR(100), merek VARCHAR(100), satuan VARCHAR(50),
            stok_min INT DEFAULT 0, stok_awal INT DEFAULT 0, harga_beli BIGINT DEFAULT 0,
            harga_jual BIGINT DEFAULT 0, satuan_alt VARCHAR(50), isi_satuan_alt INT DEFAULT 0,
            harga_jual_alt BIGINT DEFAULT 0, pajak_status VARCHAR(20), kode_pajak VARCHAR(50), keterangan TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
            id BIGINT PRIMARY KEY, nomor_transaksi VARCHAR(50), tanggal DATETIME, sparepart_id BIGINT,
            custom_item VARCHAR(500), part_numbers_alt TEXT, merek VARCHAR(100), jenis VARCHAR(20),
            jumlah INT, satuan VARCHAR(50), jumlah_dasar INT, harga_satuan BIGINT, tujuan VARCHAR(255),
            keterangan TEXT, source VARCHAR(50), kasir VARCHAR(100), status_bayar VARCHAR(20),
            metode_bayar VARCHAR(50), bayar_tunai BIGINT DEFAULT 0, transfer_amount BIGINT DEFAULT 0,
            kembalian_diberikan BIGINT DEFAULT 0, diskon BIGINT DEFAULT 0, tanggal_lunas DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS partners (
            id BIGINT PRIMARY KEY, nama VARCHAR(255), tipe VARCHAR(50), telp VARCHAR(50), alamat TEXT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS cash_expenses (
            id BIGINT PRIMARY KEY, tanggal DATETIME, jumlah BIGINT, keterangan TEXT, kasir VARCHAR(100)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS cash_inflows (
            id BIGINT PRIMARY KEY, tanggal DATETIME, jumlah BIGINT, keterangan TEXT, kasir VARCHAR(100)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS tax_records (
            tax_id VARCHAR(100) PRIMARY KEY, trx_id BIGINT, tanggal DATETIME, nomor_transaksi VARCHAR(50),
            part_number VARCHAR(255), nama VARCHAR(500), kategori VARCHAR(100), merek VARCHAR(100),
            status_bayar VARCHAR(20), pelanggan VARCHAR(255), jumlah INT, satuan VARCHAR(50),
            harga_satuan BIGINT, subtotal BIGINT, persentase_pajak DECIMAL(5,2), nilai_pajak BIGINT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS retur_records (
            id VARCHAR(50) PRIMARY KEY, parent_invoice VARCHAR(50), tanggal DATETIME, 
            kasir VARCHAR(100), pelanggan VARCHAR(255), items JSON, exchange_items JSON
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
            id INT PRIMARY KEY DEFAULT 1, kas_awal BIGINT DEFAULT 0, active_shift_start BIGINT,
            master_pajak JSON, users JSON
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        const [settings] = await pool.query('SELECT * FROM app_settings WHERE id = 1');
        if (settings.length === 0) {
            await pool.query(`INSERT INTO app_settings (id, kas_awal, active_shift_start, master_pajak, users) VALUES (1, 0, ?, ?, ?)`, [
                Date.now(),
                JSON.stringify([
                    { jenis: 'Aki Basah', persentase: 20 }, { jenis: 'Aki Kering', persentase: 11 },
                    { jenis: 'Oli', persentase: 4 }, { jenis: 'Air Radiator', persentase: 4 },
                    { jenis: 'Minyak Rem', persentase: 4 }, { jenis: 'Lainnya', persentase: 11 }
                ]),
                JSON.stringify([
                    { username: 'owner', password: 'owner123', role: 'Owner', name: 'Pemilik' },
                    { username: 'admin', password: 'admin123', role: 'Admin', name: 'Administrator' },
                    { username: 'pagi', password: 'pagi123', role: 'Kasir', name: 'Kasir Pagi' },
                    { username: 'siang', password: 'siang123', role: 'Kasir', name: 'Kasir Siang' }
                ])
            ]);
        }
        res.json({ message: "Database & Tabel siap!" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. API MIGRASI
app.post('/api/migrate', async (req, res) => {
    const oldData = req.body;
    try {
        if (oldData.spareparts?.length > 0) {
            const values = oldData.spareparts.map(sp => [sp.id, sp.kode, sp.part_number, sp.part_numbers_alt||'', sp.nama, sp.kategori||'Umum', sp.merek||'', sp.satuan||'Pcs', sp.stok_min||0, sp.stok_awal||0, sp.harga_beli||0, sp.harga_jual||0, sp.satuan_alt||'', sp.isi_satuan_alt||0, sp.harga_jual_alt||0, sp.pajak_status||'Non Pajak', sp.kode_pajak||'', sp.keterangan||'']);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT IGNORE INTO spareparts (id, kode, part_number, part_numbers_alt, nama, kategori, merek, satuan, stok_min, stok_awal, harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak, keterangan) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (oldData.transactions?.length > 0) {
            const values = oldData.transactions.map(t => [parseInt(t.id), t.nomor_transaksi, t.tanggal, t.sparepart_id, t.custom_item||null, t.part_numbers_alt||'', t.merek||'', t.jenis, t.jumlah, t.satuan, t.jumlah_dasar, t.harga_satuan, t.tujuan||'', t.keterangan||'', t.source, t.kasir||'', t.status_bayar, t.metode_bayar||'', t.bayar_tunai||0, t.transfer_amount||0, t.kembalian_diberikan||0, t.diskon||0, t.tanggal_lunas||null]);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT IGNORE INTO transactions (id, nomor_transaksi, tanggal, sparepart_id, custom_item, part_numbers_alt, merek, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, tujuan, keterangan, source, kasir, status_bayar, metode_bayar, bayar_tunai, transfer_amount, kembalian_diberikan, diskon, tanggal_lunas) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (oldData.partners?.length > 0) {
            const values = oldData.partners.map(p => [p.id, p.nama, p.tipe, p.telp||'', p.alamat||'']);
            await pool.query('INSERT IGNORE INTO partners (id, nama, tipe, telp, alamat) VALUES ?', [values]);
        }
        if (oldData.cashExpenses?.length > 0) {
            const values = oldData.cashExpenses.map(e => [e.id, e.tanggal, e.jumlah, e.keterangan, e.kasir||'']);
            await pool.query('INSERT IGNORE INTO cash_expenses (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (oldData.cashInflows?.length > 0) {
            const values = oldData.cashInflows.map(i => [i.id, i.tanggal, i.jumlah, i.keterangan, i.kasir||'']);
            await pool.query('INSERT IGNORE INTO cash_inflows (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (oldData.taxRecords?.length > 0) {
            const values = oldData.taxRecords.map(t => [t.tax_id, parseInt(t.trx_id), t.tanggal, t.nomor_transaksi, t.part_number, t.nama, t.kategori, t.merek, t.status_bayar, t.pelanggan, t.jumlah, t.satuan, t.harga_satuan, t.subtotal, t.persentase_pajak, t.nilai_pajak]);
            await pool.query('INSERT IGNORE INTO tax_records (tax_id, trx_id, tanggal, nomor_transaksi, part_number, nama, kategori, merek, status_bayar, pelanggan, jumlah, satuan, harga_satuan, subtotal, persentase_pajak, nilai_pajak) VALUES ?', [values]);
        }
        if (oldData.kasAwal !== undefined || oldData.users) {
            await pool.query('UPDATE app_settings SET kas_awal=?, active_shift_start=?, master_pajak=?, users=? WHERE id=1', [
                oldData.kasAwal || 0, oldData.activeShiftStart || Date.now(),
                JSON.stringify(oldData.masterPajak || []), JSON.stringify(oldData.users || [])
            ]);
        }
        res.json({ message: "Migrasi data lama berhasil!" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 3. GET ALL DATA
app.get('/api/data', async (req, res) => {
    try {
        const [sparepartsResult, transactionsResult, partnersResult, cashExpensesResult, cashInflowsResult, taxRecordsResult, retursResult, settingsResult] = await Promise.all([
            pool.query('SELECT * FROM spareparts'),
            pool.query('SELECT * FROM transactions'),
            pool.query('SELECT * FROM partners'),
            pool.query('SELECT * FROM cash_expenses'),
            pool.query('SELECT * FROM cash_inflows'),
            pool.query('SELECT * FROM tax_records'),
            pool.query('SELECT * FROM retur_records').catch(() => [[], []]),
            pool.query('SELECT * FROM app_settings WHERE id = 1')
        ]);

        const spareparts = sparepartsResult[0];
        const transactions = transactionsResult[0];
        const partners = partnersResult[0];
        const cashExpenses = cashExpensesResult[0];
        const cashInflows = cashInflowsResult[0];
        const taxRecords = taxRecordsResult[0];
        const returs = retursResult[0];
        const settings = settingsResult[0];
        
        let returRecords = [];
        if (returs && returs.length > 0) {
            returRecords = returs.map(r => {
                let parsedItems = r.items;
                if (typeof parsedItems === 'string') {
                    try { parsedItems = JSON.parse(parsedItems); } catch(e) { parsedItems = []; }
                }
                r.items = parsedItems;
                
                let parsedExchangeItems = r.exchange_items;
                if (typeof parsedExchangeItems === 'string') {
                    try { parsedExchangeItems = JSON.parse(parsedExchangeItems); } catch(e) { parsedExchangeItems = []; }
                } else if (!parsedExchangeItems) {
                    parsedExchangeItems = [];
                }
                r.exchange_items = parsedExchangeItems;
                
                if (r.tanggal) r.tanggal = new Date(r.tanggal).toISOString();
                return r;
            });
        }

        let masterPajak = settings[0]?.master_pajak || [];
        if (typeof masterPajak === 'string') { try { masterPajak = JSON.parse(masterPajak); } catch(e) { masterPajak = []; } }
        
        let users = settings[0]?.users || [];
        if (typeof users === 'string') { try { users = JSON.parse(users); } catch(e) { users = []; } }

        res.json({
            spareparts, transactions, partners, cashExpenses, cashInflows, taxRecords,
            returRecords,
            kasAwal: settings[0]?.kas_awal || 0,
            activeShiftStart: settings[0]?.active_shift_start || Date.now(),
            masterPajak: masterPajak,
            users: users
        });
    } catch (error) {
        console.error("Error GET DATA:", error);
        res.status(500).json({ error: error.message });
    }
});

// 4. SPAREPART
app.post('/api/sparepart', async (req, res) => {
    const sp = req.body;
    try {
        await pool.query('INSERT INTO spareparts SET ?', sp);
        res.json({ message: "Sparepart disimpan" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/sparepart/bulk', async (req, res) => {
    const { items } = req.body;
    try {
        if (items?.length > 0) {
            const values = items.map(sp => [sp.id, sp.kode, sp.part_number, sp.part_numbers_alt||'', sp.nama, sp.kategori||'Umum', sp.merek||'', sp.satuan||'Pcs', sp.stok_min||0, sp.stok_awal||0, sp.harga_beli||0, sp.harga_jual||0, sp.satuan_alt||'', sp.isi_satuan_alt||0, sp.harga_jual_alt||0, sp.pajak_status||'Non Pajak', sp.kode_pajak||'', sp.keterangan||'']);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT IGNORE INTO spareparts (id, kode, part_number, part_numbers_alt, nama, kategori, merek, satuan, stok_min, stok_awal, harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak, keterangan) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        res.json({ message: "Sparepart bulk disimpan" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/sparepart/:id', async (req, res) => {
    try {
        await pool.query('UPDATE spareparts SET ? WHERE id = ?', [req.body, req.params.id]);
        res.json({ message: "Sparepart diupdate" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/sparepart/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM spareparts WHERE id = ?', [req.params.id]);
        await pool.query('DELETE FROM transactions WHERE sparepart_id = ?', [req.params.id]);
        res.json({ message: "Sparepart dihapus" });
    } catch (error) { 
        console.error("Error hapus sparepart:", error);
        res.status(500).json({ error: error.message }); 
    }
});

// 5. TRANSAKSI
app.post('/api/transactions', async (req, res) => {
    const { transactions, taxRecords } = req.body;
    try {
        if (transactions?.length > 0) {
            const values = transactions.map(t => [parseInt(t.id), t.nomor_transaksi, t.tanggal, t.sparepart_id, t.custom_item||null, t.part_numbers_alt||'', t.merek||'', t.jenis, t.jumlah, t.satuan, t.jumlah_dasar, t.harga_satuan, t.tujuan||'', t.keterangan||'', t.source, t.kasir||'', t.status_bayar, t.metode_bayar||'', t.bayar_tunai||0, t.transfer_amount||0, t.kembalian_diberikan||0, t.diskon||0, t.tanggal_lunas||null]);
            await pool.query('INSERT IGNORE INTO transactions (id, nomor_transaksi, tanggal, sparepart_id, custom_item, part_numbers_alt, merek, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, tujuan, keterangan, source, kasir, status_bayar, metode_bayar, bayar_tunai, transfer_amount, kembalian_diberikan, diskon, tanggal_lunas) VALUES ?', [values]);
        }
        if (taxRecords?.length > 0) {
            const values = taxRecords.map(t => [t.tax_id, parseInt(t.trx_id), t.tanggal, t.nomor_transaksi, t.part_number, t.nama, t.kategori, t.merek, t.status_bayar, t.pelanggan, t.jumlah, t.satuan, t.harga_satuan, t.subtotal, t.persentase_pajak, t.nilai_pajak]);
            await pool.query('INSERT IGNORE INTO tax_records (tax_id, trx_id, tanggal, nomor_transaksi, part_number, nama, kategori, merek, status_bayar, pelanggan, jumlah, satuan, harga_satuan, subtotal, persentase_pajak, nilai_pajak) VALUES ?', [values]);
        }
        res.json({ message: "Transaksi disimpan" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// HAPUS 1 INVOICE
app.post('/api/transaction/delete-invoice', async (req, res) => {
    const { trxId } = req.body;
    try {
        const [returs] = await pool.query('SELECT id FROM retur_records WHERE parent_invoice = ?', [trxId]);
        
        await pool.query('DELETE FROM transactions WHERE nomor_transaksi = ?', [trxId]);
        await pool.query('DELETE FROM tax_records WHERE nomor_transaksi = ?', [trxId]);

        if (returs.length > 0) {
            for (const r of returs) {
                await pool.query('DELETE FROM transactions WHERE nomor_transaksi = ?', [r.id]);
                await pool.query('DELETE FROM tax_records WHERE nomor_transaksi = ?', [r.id]);
            }
        }

        await pool.query('DELETE FROM retur_records WHERE parent_invoice = ?', [trxId]);
        res.json({ message: "Invoice & Retur berhasil dihapus dari server" });
    } catch (error) { 
        console.error("Error hapus invoice:", error);
        res.status(500).json({ error: error.message }); 
    }
});

// HAPUS RETUR
app.post('/api/transaction/delete-retur', async (req, res) => {
    const { returId } = req.body;
    try {
        await pool.query('DELETE FROM transactions WHERE nomor_transaksi = ?', [returId]);
        await pool.query('DELETE FROM tax_records WHERE nomor_transaksi = ?', [returId]);
        await pool.query('DELETE FROM retur_records WHERE id = ?', [returId]);
        res.json({ message: "Retur berhasil dihapus dari server" });
    } catch (error) { 
        console.error("Error hapus retur:", error);
        res.status(500).json({ error: error.message }); 
    }
});

// HAPUS 1 ITEM TRANSAKSI MANUAL
app.post('/api/transaction/delete', async (req, res) => {
    const { id } = req.body;
    try {
        const cleanId = parseInt(id);
        await pool.query('DELETE FROM transactions WHERE id = ?', [cleanId]);
        await pool.query('DELETE FROM tax_records WHERE trx_id = ?', [cleanId]);
        res.json({ message: "Transaksi berhasil dihapus dari server" });
    } catch (error) { 
        console.error("Error hapus transaksi:", error);
        res.status(500).json({ error: error.message }); 
    }
});

// EDIT/TUKAR BARANG TRANSAKSI
app.put('/api/transaction/:id', async (req, res) => {
    const { id } = req.params;
    const updatedData = req.body;
    try {
        await pool.query('UPDATE transactions SET sparepart_id=?, custom_item=?, jenis=?, jumlah=?, satuan=?, jumlah_dasar=?, tujuan=?, keterangan=? WHERE id = ?', [
            updatedData.sparepart_id, updatedData.custom_item, updatedData.jenis, updatedData.jumlah, 
            updatedData.satuan, updatedData.jumlah_dasar, updatedData.tujuan, updatedData.keterangan, parseInt(id)
        ]);
        res.json({ message: "Transaksi berhasil diupdate (Tukar Barang)" });
    } catch (error) { 
        console.error("Error edit transaksi:", error);
        res.status(500).json({ error: error.message }); 
    }
});

// LUNASI BON / PIUTANG
app.put('/api/transactions/payoff', async (req, res) => {
    const { trxId } = req.body;
    try {
        await pool.query('UPDATE transactions SET status_bayar = "Lunas", keterangan = "Bon (Lunas)", tanggal_lunas = NOW() WHERE nomor_transaksi = ?', [trxId]);
        await pool.query('UPDATE tax_records SET status_bayar = "Lunas" WHERE nomor_transaksi = ?', [trxId]);
        res.json({ message: "Piutang berhasil dilunasi" });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// 6. PARTNER
app.post('/api/partner', async (req, res) => { try { await pool.query('INSERT INTO partners SET ?', req.body); res.json({message:"Partner disimpan"}); } catch(e){ res.status(500).json({error:e.message}); } });
app.put('/api/partner/:id', async (req, res) => { try { await pool.query('UPDATE partners SET ? WHERE id = ?', [req.body, req.params.id]); res.json({message:"Partner diupdate"}); } catch(e){ res.status(500).json({error:e.message}); } });
app.delete('/api/partner/:id', async (req, res) => { try { await pool.query('DELETE FROM partners WHERE id = ?', [req.params.id]); res.json({message:"Partner dihapus"}); } catch(e){ res.status(500).json({error:e.message}); } });

// 7. SETTINGS
app.put('/api/settings', async (req, res) => {
    const { kasAwal, activeShiftStart, masterPajak, users, returRecords, cashExpenses, cashInflows } = req.body;
    try {
        await pool.query('UPDATE app_settings SET kas_awal=?, active_shift_start=?, master_pajak=?, users=? WHERE id=1', [
            kasAwal || 0, activeShiftStart || Date.now(), JSON.stringify(masterPajak || []), JSON.stringify(users || [])
        ]);
        
        if (returRecords) {
            if (returRecords.length > 0) {
                const values = returRecords.map(r => [r.id, r.parent_invoice, new Date(r.tanggal), r.kasir||'', r.pelanggan||'', JSON.stringify(r.items || []), JSON.stringify(r.exchange_items || [])]);
                await pool.query('INSERT INTO retur_records (id, parent_invoice, tanggal, kasir, pelanggan, items, exchange_items) VALUES ? ON DUPLICATE KEY UPDATE parent_invoice=VALUES(parent_invoice), tanggal=VALUES(tanggal), kasir=VALUES(kasir), pelanggan=VALUES(pelanggan), items=VALUES(items), exchange_items=VALUES(exchange_items)', [values]);
                const ids = returRecords.map(r => r.id);
                await pool.query('DELETE FROM retur_records WHERE id NOT IN (?)', [ids]);
            } else {
                await pool.query('DELETE FROM retur_records');
            }
        }
        
        if (cashExpenses) {
            if (cashExpenses.length > 0) {
                const values = cashExpenses.map(e => [e.id, new Date(e.tanggal), e.jumlah, e.keterangan||'', e.kasir||'']);
                await pool.query('INSERT INTO cash_expenses (id, tanggal, jumlah, keterangan, kasir) VALUES ? ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal), jumlah=VALUES(jumlah), keterangan=VALUES(keterangan), kasir=VALUES(kasir)', [values]);
                const ids = cashExpenses.map(e => e.id);
                await pool.query('DELETE FROM cash_expenses WHERE id NOT IN (?)', [ids]);
            } else {
                await pool.query('DELETE FROM cash_expenses');
            }
        }
        
        if (cashInflows) {
            if (cashInflows.length > 0) {
                const values = cashInflows.map(i => [i.id, new Date(i.tanggal), i.jumlah, i.keterangan||'', i.kasir||'']);
                await pool.query('INSERT INTO cash_inflows (id, tanggal, jumlah, keterangan, kasir) VALUES ? ON DUPLICATE KEY UPDATE tanggal=VALUES(tanggal), jumlah=VALUES(jumlah), keterangan=VALUES(keterangan), kasir=VALUES(kasir)', [values]);
                const ids = cashInflows.map(i => i.id);
                await pool.query('DELETE FROM cash_inflows WHERE id NOT IN (?)', [ids]);
            } else {
                await pool.query('DELETE FROM cash_inflows');
            }
        }

        res.json({ message: "Settings berhasil disimpan" });
    } catch (error) {
        console.error("Error settings:", error);
        res.status(500).json({ error: error.message });
    }
});

// 8. RESTORE DATA
app.post('/api/restore', async (req, res) => {
    const data = req.body;
    try {
        await pool.query('DELETE FROM spareparts');
        await pool.query('DELETE FROM transactions');
        await pool.query('DELETE FROM partners');
        await pool.query('DELETE FROM cash_expenses');
        await pool.query('DELETE FROM cash_inflows');
        await pool.query('DELETE FROM tax_records');
        await pool.query('DELETE FROM retur_records');

        if (data.spareparts?.length > 0) {
            const values = data.spareparts.map(sp => [sp.id, sp.kode, sp.part_number, sp.part_numbers_alt||'', sp.nama, sp.kategori||'Umum', sp.merek||'', sp.satuan||'Pcs', sp.stok_min||0, sp.stok_awal||0, sp.harga_beli||0, sp.harga_jual||0, sp.satuan_alt||'', sp.isi_satuan_alt||0, sp.harga_jual_alt||0, sp.pajak_status||'Non Pajak', sp.kode_pajak||'', sp.keterangan||'']);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT INTO spareparts (id, kode, part_number, part_numbers_alt, nama, kategori, merek, satuan, stok_min, stok_awal, harga_beli, harga_jual, satuan_alt, isi_satuan_alt, harga_jual_alt, pajak_status, kode_pajak, keterangan) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (data.transactions?.length > 0) {
            const values = data.transactions.map(t => [parseInt(t.id), t.nomor_transaksi, t.tanggal, t.sparepart_id, t.custom_item||null, t.part_numbers_alt||'', t.merek||'', t.jenis, t.jumlah, t.satuan, t.jumlah_dasar, t.harga_satuan, t.tujuan||'', t.keterangan||'', t.source, t.kasir||'', t.status_bayar, t.metode_bayar||'', t.bayar_tunai||0, t.transfer_amount||0, t.kembalian_diberikan||0, t.diskon||0, t.tanggal_lunas||null]);
            for (let i = 0; i < values.length; i += 500) {
                await pool.query('INSERT INTO transactions (id, nomor_transaksi, tanggal, sparepart_id, custom_item, part_numbers_alt, merek, jenis, jumlah, satuan, jumlah_dasar, harga_satuan, tujuan, keterangan, source, kasir, status_bayar, metode_bayar, bayar_tunai, transfer_amount, kembalian_diberikan, diskon, tanggal_lunas) VALUES ?', [values.slice(i, i + 500)]);
            }
        }
        if (data.partners?.length > 0) {
            const values = data.partners.map(p => [p.id, p.nama, p.tipe, p.telp||'', p.alamat||'']);
            await pool.query('INSERT INTO partners (id, nama, tipe, telp, alamat) VALUES ?', [values]);
        }
        if (data.cashExpenses?.length > 0) {
            const values = data.cashExpenses.map(e => [e.id, e.tanggal, e.jumlah, e.keterangan, e.kasir||'']);
            await pool.query('INSERT INTO cash_expenses (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (data.cashInflows?.length > 0) {
            const values = data.cashInflows.map(i => [i.id, i.tanggal, i.jumlah, i.keterangan, i.kasir||'']);
            await pool.query('INSERT INTO cash_inflows (id, tanggal, jumlah, keterangan, kasir) VALUES ?', [values]);
        }
        if (data.taxRecords?.length > 0) {
            const values = data.taxRecords.map(t => [t.tax_id, parseInt(t.trx_id), t.tanggal, t.nomor_transaksi, t.part_number, t.nama, t.kategori, t.merek, t.status_bayar, t.pelanggan, t.jumlah, t.satuan, t.harga_satuan, t.subtotal, t.persentase_pajak, t.nilai_pajak]);
            await pool.query('INSERT INTO tax_records (tax_id, trx_id, tanggal, nomor_transaksi, part_number, nama, kategori, merek, status_bayar, pelanggan, jumlah, satuan, harga_satuan, subtotal, persentase_pajak, nilai_pajak) VALUES ?', [values]);
        }
        if (data.returRecords?.length > 0) {
            const values = data.returRecords.map(r => [r.id, r.parent_invoice, new Date(r.tanggal), r.kasir||'', r.pelanggan||'', JSON.stringify(r.items || []), JSON.stringify(r.exchange_items || [])]);
            await pool.query('INSERT INTO retur_records (id, parent_invoice, tanggal, kasir, pelanggan, items, exchange_items) VALUES ?', [values]);
        }

        await pool.query('UPDATE app_settings SET kas_awal=?, active_shift_start=?, master_pajak=?, users=? WHERE id=1', [
            data.kasAwal || 0, data.activeShiftStart || Date.now(),
            JSON.stringify(data.masterPajak || []), JSON.stringify(data.users || [])
        ]);

        res.json({ message: "Restore data berhasil! Semua tabel di server telah ditimpa." });
    } catch (error) {
        console.error("Error restore:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
