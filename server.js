const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'estatehub_super_secret_key_2025';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });

// MySQL Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'estatehub_db',
    port: 3306
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
        console.log('\n⚠️  Please make sure:');
        console.log('1. XAMPP is running (MySQL service)');
        console.log('2. Database "estatehub_db" exists');
        process.exit(1);
    } else {
        console.log('✅ Connected to MySQL database');
        initializeDatabase();
    }
});

// Initialize database
function initializeDatabase() {
    const createTables = `
        CREATE TABLE IF NOT EXISTS users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20),
            location VARCHAR(255),
            role ENUM('buyer', 'agent', 'admin') DEFAULT 'buyer',
            status ENUM('active', 'inactive') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS properties (
            id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(255) NOT NULL,
            location VARCHAR(255) NOT NULL,
            city VARCHAR(100),
            price DECIMAL(15,2) NOT NULL,
            listing_type ENUM('sale', 'rent', 'lease') DEFAULT 'sale',
            type ENUM('residential', 'commercial') DEFAULT 'residential',
            rooms VARCHAR(50),
            area_sqft DECIMAL(10,2),
            year_built INT,
            description TEXT,
            images TEXT,
            agent_id INT,
            agent_name VARCHAR(100),
            agent_phone VARCHAR(20),
            status ENUM('active', 'inactive') DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (agent_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS bookings (
            id INT PRIMARY KEY AUTO_INCREMENT,
            property_id INT,
            property_name VARCHAR(255),
            buyer_id INT,
            buyer_name VARCHAR(100),
            buyer_email VARCHAR(100),
            buyer_phone VARCHAR(20),
            booking_type ENUM('visit', 'buy', 'rent') DEFAULT 'visit',
            payment_amount DECIMAL(15,2) DEFAULT 0,
            payment_status ENUM('pending', 'completed') DEFAULT 'pending',
            status ENUM('pending', 'approved', 'completed', 'cancelled', 'refunded') DEFAULT 'pending',
            visit_date DATE,
            visit_time TIME,
            refund_reason TEXT,
            refund_date TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
            FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS payments (
            id INT PRIMARY KEY AUTO_INCREMENT,
            booking_id INT,
            transaction_id VARCHAR(100) UNIQUE,
            buyer_name VARCHAR(100),
            property_name VARCHAR(255),
            agent_id INT,
            agent_name VARCHAR(100),
            amount DECIMAL(15,2),
            payment_method VARCHAR(50),
            status ENUM('pending', 'completed', 'refunded') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS loans (
            id INT PRIMARY KEY AUTO_INCREMENT,
            property_id INT,
            property_name VARCHAR(255),
            buyer_id INT,
            buyer_name VARCHAR(100),
            buyer_email VARCHAR(100),
            buyer_phone VARCHAR(20),
            loan_amount DECIMAL(15,2),
            down_payment DECIMAL(15,2),
            interest_rate DECIMAL(5,2),
            loan_tenure INT,
            monthly_emi DECIMAL(15,2),
            employment_type VARCHAR(50),
            annual_income DECIMAL(15,2),
            status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL,
            FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS reviews (
            id INT PRIMARY KEY AUTO_INCREMENT,
            property_id INT NOT NULL,
            user_id INT NOT NULL,
            user_name VARCHAR(100) NOT NULL,
            rating INT NOT NULL,
            comment TEXT NOT NULL,
            status VARCHAR(20) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT,
            user_name VARCHAR(100),
            user_email VARCHAR(100),
            subject VARCHAR(255),
            message TEXT,
            admin_response TEXT,
            status ENUM('open', 'closed') DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS wishlist (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT,
            property_id INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
            UNIQUE KEY unique_wishlist (user_id, property_id)
        );
    `;

    const statements = createTables.split(';').filter(stmt => stmt.trim());
    let executed = 0;
    
    statements.forEach(statement => {
        if (statement.trim()) {
            db.query(statement, (err) => {
                if (err) console.error('Table creation error:', err.message);
                executed++;
                if (executed === statements.length) {
                    console.log('✅ Database tables initialized');
                    insertDefaultData();
                }
            });
        }
    });
}

// Insert default data
function insertDefaultData() {
    db.query("SELECT * FROM users WHERE email = 'admin@estatehub.com'", async (err, results) => {
        if (err) return;
        if (results.length === 0) {
            db.query(
                "INSERT INTO users (name, email, password, phone, location, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ['Admin User', 'admin@estatehub.com', 'admin123', '9999999999', 'Admin Office', 'admin', 'active']
            );
            
            db.query(
                "INSERT INTO users (name, email, password, phone, location, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ['Demo Agent', 'agent@estatehub.com', 'agent123', '9876543210', 'Mumbai', 'agent', 'active']
            );
            
            db.query(
                "INSERT INTO users (name, email, password, phone, location, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ['Demo Buyer', 'buyer@estatehub.com', 'buyer123', '9876543211', 'Delhi', 'buyer', 'active']
            );
            
            db.query("SELECT id FROM users WHERE email = 'agent@estatehub.com'", (err, agentResult) => {
                if (!err && agentResult.length > 0) {
                    const agentId = agentResult[0].id;
                    db.query(
                        `INSERT INTO properties (name, location, city, price, listing_type, type, rooms, area_sqft, year_built, description, images, agent_id, agent_name, agent_phone, status) VALUES 
                        ('Luxury Apartment', 'Andheri West', 'Mumbai', 25000000, 'sale', 'residential', '3 BHK', 1500, 2022, 'Beautiful luxury apartment with modern amenities', '["https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400"]', ?, 'Demo Agent', '9876543210', 'active'),
                        ('Commercial Office', 'Banjara Hills', 'Hyderabad', 5000000, 'lease', 'commercial', '5 cabins', 2000, 2021, 'Prime office space in business district', '["https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=400"]', ?, 'Demo Agent', '9876543210', 'active')`,
                        [agentId, agentId]
                    );
                }
            });
            console.log('✅ Default data inserted');
        }
    });
}

// Authentication Middleware
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
};

// ========== API ROUTES ==========

// Properties Routes
app.get('/api/properties', (req, res) => {
    const { search, type, listing_type } = req.query;
    let query = 'SELECT * FROM properties WHERE status = "active"';
    let params = [];
    
    if (search) {
        query += ' AND (name LIKE ? OR location LIKE ?)';
        params.push(`%${search}%`, `%${search}%`);
    }
    if (type && type !== '') {
        query += ' AND type = ?';
        params.push(type);
    }
    if (listing_type && listing_type !== '') {
        query += ' AND listing_type = ?';
        params.push(listing_type);
    }
    
    query += ' ORDER BY created_at DESC';
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.get('/api/properties/:id', (req, res) => {
    db.query('SELECT * FROM properties WHERE id = ?', [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Property not found' });
        res.json(results[0]);
    });
});

app.post('/api/properties', authenticate, authorize('agent', 'admin'), (req, res) => {
    const { name, location, city, price, listing_type, type, rooms, area_sqft, year_built, description, images } = req.body;
    
    if (!name || !location || !price) {
        return res.status(400).json({ error: 'Name, location and price are required' });
    }
    
    const imagesJson = JSON.stringify(images || []);
    
    db.query(
        `INSERT INTO properties (name, location, city, price, listing_type, type, rooms, area_sqft, year_built, description, images, agent_id, agent_name, agent_phone, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        [name, location, city || '', price, listing_type || 'sale', type || 'residential', rooms || '', area_sqft || null, year_built || null, description || '', imagesJson, req.user.id, req.user.name, req.user.phone || ''],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Property added', propertyId: result.insertId });
        }
    );
});

app.delete('/api/properties/:id', authenticate, authorize('agent', 'admin'), (req, res) => {
    db.query('DELETE FROM properties WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Property deleted' });
    });
});

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, phone, location, role } = req.body;
    
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email and password are required' });
    }
    
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const userRole = role === 'agent' ? 'agent' : 'buyer';
        
        db.query(
            'INSERT INTO users (name, email, password, phone, location, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, email, hashedPassword, phone || '', location || '', userRole, 'active'],
            (err, result) => {
                if (err) return res.status(500).json({ error: err.message });
                res.status(201).json({ message: 'Registration successful', userId: result.insertId });
            }
        );
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password, role } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    
    db.query('SELECT * FROM users WHERE email = ? AND role = ?', [email, role], async (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = results[0];
        if (user.status !== 'active') {
            return res.status(401).json({ error: 'Account is inactive' });
        }
        
        let validPassword = false;
        if (user.password.length === 60 && user.password.startsWith('$2')) {
            validPassword = await bcrypt.compare(password, user.password);
        } else {
            validPassword = (password === user.password);
            if (validPassword) {
                const hashed = await bcrypt.hash(password, 10);
                db.query('UPDATE users SET password = ? WHERE id = ?', [hashed, user.id]);
            }
        }
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                location: user.location,
                role: user.role
            }
        });
    });
});

// Bookings Routes
app.get('/api/bookings', authenticate, (req, res) => {
    let query = '';
    let params = [];
    
    if (req.user.role === 'buyer') {
        query = 'SELECT * FROM bookings WHERE buyer_id = ? ORDER BY created_at DESC';
        params = [req.user.id];
    } else if (req.user.role === 'agent') {
        query = `SELECT b.* FROM bookings b 
                 JOIN properties p ON b.property_id = p.id 
                 WHERE p.agent_id = ? ORDER BY b.created_at DESC`;
        params = [req.user.id];
    } else {
        query = 'SELECT * FROM bookings ORDER BY created_at DESC';
    }
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/bookings', authenticate, (req, res) => {
    const { property_id, property_name, booking_type, payment_amount, visit_date, visit_time } = req.body;
    
    db.query(
        `INSERT INTO bookings (property_id, property_name, buyer_id, buyer_name, buyer_email, buyer_phone, booking_type, payment_amount, payment_status, status, visit_date, visit_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)`,
        [property_id, property_name, req.user.id, req.user.name, req.user.email, req.user.phone || '', booking_type, payment_amount || 0, visit_date || null, visit_time || null],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Booking created', bookingId: result.insertId });
        }
    );
});

app.put('/api/bookings/:id/status', authenticate, authorize('agent', 'admin'), (req, res) => {
    const { status } = req.body;
    db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Booking status updated' });
    });
});

app.put('/api/bookings/:id/cancel', authenticate, (req, res) => {
    db.query('UPDATE bookings SET status = "cancelled" WHERE id = ? AND buyer_id = ?', [req.params.id, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Booking cancelled' });
    });
});

app.put('/api/bookings/:id/refund', authenticate, authorize('agent', 'admin'), (req, res) => {
    const { reason } = req.body;
    db.query(
        'UPDATE bookings SET status = "refunded", refund_reason = ?, refund_date = NOW() WHERE id = ?',
        [reason || 'No reason provided', req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Refund processed' });
        }
    );
});

// Payments Routes
app.get('/api/payments', authenticate, (req, res) => {
    let query = '';
    let params = [];
    
    if (req.user.role === 'buyer') {
        query = 'SELECT * FROM payments WHERE buyer_name = ? ORDER BY created_at DESC';
        params = [req.user.name];
    } else if (req.user.role === 'agent') {
        query = 'SELECT * FROM payments WHERE agent_id = ? ORDER BY created_at DESC';
        params = [req.user.id];
    } else {
        query = 'SELECT * FROM payments ORDER BY created_at DESC';
    }
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/payments', authenticate, (req, res) => {
    const { booking_id, property_name, amount, payment_method } = req.body;
    const transaction_id = 'TXN' + Date.now() + Math.random().toString(36).substr(2, 6);
    
    db.query(
        `INSERT INTO payments (booking_id, transaction_id, buyer_name, property_name, amount, payment_method, status)
         VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
        [booking_id, transaction_id, req.user.name, property_name, amount, payment_method],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            db.query('UPDATE bookings SET payment_status = "completed", status = "completed" WHERE id = ?', [booking_id]);
            
            res.status(201).json({ message: 'Payment successful', paymentId: result.insertId });
        }
    );
});

// Loans Routes
app.get('/api/loans', authenticate, (req, res) => {
    let query = '';
    let params = [];
    
    if (req.user.role === 'buyer') {
        query = 'SELECT * FROM loans WHERE buyer_id = ? ORDER BY created_at DESC';
        params = [req.user.id];
    } else {
        query = 'SELECT * FROM loans ORDER BY created_at DESC';
    }
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/loans', authenticate, authorize('buyer'), (req, res) => {
    const { property_id, property_name, loan_amount, down_payment, interest_rate, loan_tenure, monthly_emi, employment_type, annual_income } = req.body;
    
    db.query(
        `INSERT INTO loans (property_id, property_name, buyer_id, buyer_name, buyer_email, buyer_phone, loan_amount, down_payment, interest_rate, loan_tenure, monthly_emi, employment_type, annual_income, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [property_id, property_name, req.user.id, req.user.name, req.user.email, req.user.phone || '', loan_amount, down_payment, interest_rate, loan_tenure, monthly_emi, employment_type, annual_income],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Loan application submitted', loanId: result.insertId });
        }
    );
});

app.put('/api/loans/:id/status', authenticate, authorize('admin'), (req, res) => {
    const { status } = req.body;
    db.query('UPDATE loans SET status = ? WHERE id = ?', [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Loan status updated' });
    });
});

// ========== REVIEWS ROUTES (FIXED) ==========

// Get reviews for a property
app.get('/api/reviews/:property_id', (req, res) => {
    const propertyId = req.params.property_id;
    db.query('SELECT * FROM reviews WHERE property_id = ? ORDER BY created_at DESC', [propertyId], (err, results) => {
        if (err) {
            console.error('Error fetching reviews:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log(`Found ${results.length} reviews for property ${propertyId}`);
        res.json(results || []);
    });
});

// Add a review - WITHOUT status column
app.post('/api/reviews', authenticate, (req, res) => {
    const { property_id, rating, comment } = req.body;
    
    if (!property_id || !rating || !comment) {
        return res.status(400).json({ error: 'Property ID, rating and comment are required' });
    }
    
    console.log('Adding review:', { property_id, user_id: req.user.id, user_name: req.user.name, rating, comment });
    
    db.query(
        'INSERT INTO reviews (property_id, user_id, user_name, rating, comment) VALUES (?, ?, ?, ?, ?)',
        [property_id, req.user.id, req.user.name, rating, comment],
        (err, result) => {
            if (err) {
                console.error('Insert error:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log('Review added successfully:', result.insertId);
            res.status(201).json({ message: 'Review added', reviewId: result.insertId });
        }
    );
});

// Approve a review (Agent only)
app.put('/api/reviews/:id/approve', authenticate, authorize('agent', 'admin'), (req, res) => {
    db.query('UPDATE reviews SET status = "approved" WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Review approved successfully' });
    });
});

// Reject a review (Agent only)
app.put('/api/reviews/:id/reject', authenticate, authorize('agent', 'admin'), (req, res) => {
    db.query('UPDATE reviews SET status = "rejected" WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Review rejected' });
    });
});

// DELETE a review
app.delete('/api/reviews/:id', authenticate, (req, res) => {
    const reviewId = req.params.id;
    
    db.query('SELECT * FROM reviews WHERE id = ?', [reviewId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Review not found' });
        
        const review = results[0];
        
        if (req.user.role !== 'admin' && req.user.id !== review.user_id) {
            return res.status(403).json({ error: 'You can only delete your own reviews' });
        }
        
        db.query('DELETE FROM reviews WHERE id = ?', [reviewId], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Review deleted successfully' });
        });
    });
});

// Wishlist Routes
app.get('/api/wishlist', authenticate, (req, res) => {
    db.query(
        'SELECT property_id FROM wishlist WHERE user_id = ?',
        [req.user.id],
        (err, results) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(results.map(r => r.property_id));
        }
    );
});

app.post('/api/wishlist', authenticate, (req, res) => {
    const { property_id } = req.body;
    
    db.query(
        'INSERT INTO wishlist (user_id, property_id) VALUES (?, ?)',
        [req.user.id, property_id],
        (err) => {
            if (err && err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Already in wishlist' });
            }
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Added to wishlist' });
        }
    );
});

app.delete('/api/wishlist/:property_id', authenticate, (req, res) => {
    db.query(
        'DELETE FROM wishlist WHERE user_id = ? AND property_id = ?',
        [req.user.id, req.params.property_id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Removed from wishlist' });
        }
    );
});

// Tickets Routes
app.get('/api/tickets', authenticate, (req, res) => {
    let query = '';
    let params = [];
    
    if (req.user.role === 'admin') {
        query = 'SELECT * FROM tickets ORDER BY created_at DESC';
    } else {
        query = 'SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC';
        params = [req.user.id];
    }
    
    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.post('/api/tickets', authenticate, (req, res) => {
    const { subject, message } = req.body;
    
    db.query(
        'INSERT INTO tickets (user_id, user_name, user_email, subject, message, status) VALUES (?, ?, ?, ?, ?, "open")',
        [req.user.id, req.user.name, req.user.email, subject, message],
        (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            res.status(201).json({ message: 'Ticket submitted', ticketId: result.insertId });
        }
    );
});

app.put('/api/tickets/:id/close', authenticate, authorize('admin'), (req, res) => {
    const { response } = req.body;
    db.query(
        'UPDATE tickets SET status = "closed", admin_response = ? WHERE id = ?',
        [response || 'Resolved', req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Ticket closed' });
        }
    );
});

// Admin User Management Routes
app.get('/api/users', authenticate, authorize('admin'), (req, res) => {
    db.query('SELECT id, name, email, phone, location, role, status, created_at FROM users', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

app.put('/api/users/:id/status', authenticate, authorize('admin'), (req, res) => {
    const { status } = req.body;
    db.query('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User status updated' });
    });
});

app.delete('/api/users/:id', authenticate, authorize('admin'), (req, res) => {
    db.query('DELETE FROM users WHERE id = ? AND role != "admin"', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'User deleted' });
    });
});

// AI Price Prediction Route
app.post('/api/predict-price', (req, res) => {
    const { location, area_sqft, bhk, property_type, age_years, amenities_score } = req.body;
    
    const cityBaseRates = {
        'mumbai': 18000, 'andheri': 16000, 'bandra': 25000, 'powai': 14000, 'worli': 30000,
        'bangalore': 12000, 'whitefield': 9500, 'indiranagar': 14500, 'koramangala': 13000,
        'delhi': 10000, 'gurgaon': 11500, 'noida': 8500, 'south delhi': 16000,
        'hyderabad': 7500, 'banjara hills': 12000, 'hitech city': 8500,
        'chennai': 7000, 'pune': 8500, 'kolkata': 5500, 'ahmedabad': 6000,
        'default': 6000
    };
    
    let baseRate = cityBaseRates.default;
    const lowerLoc = (location || '').toLowerCase();
    for (let [city, rate] of Object.entries(cityBaseRates)) {
        if (lowerLoc.includes(city)) {
            baseRate = rate;
            break;
        }
    }
    
    const typeMultiplier = property_type === 'residential' ? 1.0 : 1.4;
    let bhkMultiplier = 0.9 + ((bhk || 2) * 0.08);
    bhkMultiplier = Math.min(1.3, bhkMultiplier);
    
    let ageMultiplier = 1.0;
    const age = age_years || 0;
    if (age === 0) ageMultiplier = 1.05;
    else if (age <= 3) ageMultiplier = 1.0;
    else if (age <= 7) ageMultiplier = 0.92;
    else if (age <= 12) ageMultiplier = 0.85;
    else ageMultiplier = 0.78;
    
    const amenitiesMultiplier = 0.85 + ((amenities_score || 5) / 100);
    
    let predictedPricePerSqFt = baseRate * typeMultiplier * bhkMultiplier * ageMultiplier * amenitiesMultiplier;
    let predictedPrice = (area_sqft || 1000) * predictedPricePerSqFt;
    
    const premiumLocations = ['bandra', 'worli', 'juhu', 'south delhi', 'banjara hills', 'indiranagar'];
    if (premiumLocations.some(loc => lowerLoc.includes(loc))) {
        predictedPrice = predictedPrice * 1.25;
    }
    
    predictedPrice = Math.round(predictedPrice / 1000) * 1000;
    
    let confidence = 70;
    if (area_sqft && area_sqft > 500 && area_sqft < 5000) confidence += 10;
    if (baseRate !== cityBaseRates.default) confidence += 10;
    if (amenities_score && amenities_score >= 7) confidence += 5;
    if (age <= 10) confidence += 5;
    confidence = Math.min(96, Math.max(55, confidence));
    
    const rangePercent = property_type === 'residential' ? 0.12 : 0.15;
    const minMarket = predictedPrice * (1 - rangePercent);
    const maxMarket = predictedPrice * (1 + rangePercent);
    
    res.json({
        predicted_price: predictedPrice,
        price_per_sqft: Math.round(predictedPricePerSqFt),
        confidence_level: confidence,
        market_range: {
            min: Math.round(minMarket),
            max: Math.round(maxMarket)
        }
    });
});

// Dashboard Stats Route
app.get('/api/stats', authenticate, authorize('admin'), (req, res) => {
    const queries = {
        users: 'SELECT COUNT(*) as count FROM users',
        properties: 'SELECT COUNT(*) as count FROM properties',
        bookings: 'SELECT COUNT(*) as count FROM bookings',
        payments: 'SELECT SUM(amount) as total FROM payments WHERE status = "completed"',
        loans: 'SELECT COUNT(*) as count, SUM(loan_amount) as total FROM loans'
    };
    
    const results = {};
    let completed = 0;
    const totalQueries = Object.keys(queries).length;
    
    for (const [key, query] of Object.entries(queries)) {
        db.query(query, (err, rows) => {
            if (err) results[key] = { error: err.message };
            else results[key] = rows[0];
            
            completed++;
            if (completed === totalQueries) {
                res.json(results);
            }
        });
    }
});

// ========== SERVE FRONTEND ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// For any other route that's not an API route, serve index.html
app.get('/:route', (req, res, next) => {
    if (req.params.route === 'api') {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 EstateHub Server running on http://localhost:${PORT}`);
    console.log('\n📋 API Endpoints:');
    console.log('   GET    /api/properties            - Get all properties');
    console.log('   GET    /api/reviews/:property_id  - Get property reviews');
    console.log('   POST   /api/reviews               - Add review');
    console.log('   PUT    /api/reviews/:id/approve   - Approve review');
    console.log('   PUT    /api/reviews/:id/reject    - Reject review');
    console.log('   DELETE /api/reviews/:id           - Delete review');
    console.log('\n🔑 Test Credentials:');
    console.log('   Admin:  admin@estatehub.com / admin123');
    console.log('   Agent:  agent@estatehub.com / agent123');
    console.log('   Buyer:  buyer@estatehub.com / buyer123');
    console.log('\n✅ Server is ready! Open http://localhost:3000 in your browser\n');
});

module.exports = app;