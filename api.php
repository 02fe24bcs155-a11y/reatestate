<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Database connection
$host = 'localhost';
$dbname = 'estatehub_db';
$username = 'root';
$password = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit();
}

$request_method = $_SERVER['REQUEST_METHOD'];
$request_uri = $_SERVER['REQUEST_URI'];
$path = parse_url($request_uri, PHP_URL_PATH);
$path_segments = explode('/', trim($path, '/'));

// Simple routing
$endpoint = isset($path_segments[1]) ? $path_segments[1] : '';

// Get POST data
$input = json_decode(file_get_contents('php://input'), true);

// =====================================================
// AUTH ENDPOINTS
// =====================================================

if ($endpoint === 'login' && $request_method === 'POST') {
    $email = $input['email'] ?? '';
    $password = $input['password'] ?? '';
    $role = $input['role'] ?? '';
    
    $stmt = $pdo->prepare("SELECT * FROM users WHERE email = ? AND role = ? AND status = 'active'");
    $stmt->execute([$email, $role]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if ($user && $user['password'] === $password) {
        unset($user['password']);
        echo json_encode(['success' => true, 'user' => $user]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Invalid credentials']);
    }
    exit();
}

if ($endpoint === 'register' && $request_method === 'POST') {
    $name = $input['name'] ?? '';
    $email = $input['email'] ?? '';
    $password = $input['password'] ?? '';
    $phone = $input['phone'] ?? '';
    $location = $input['location'] ?? '';
    $role = $input['role'] ?? 'buyer';
    
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Email already exists']);
        exit();
    }
    
    $stmt = $pdo->prepare("INSERT INTO users (name, email, password, phone, location, role) VALUES (?, ?, ?, ?, ?, ?)");
    if ($stmt->execute([$name, $email, $password, $phone, $location, $role])) {
        echo json_encode(['success' => true, 'message' => 'Registration successful']);
    } else {
        echo json_encode(['success' => false, 'error' => 'Registration failed']);
    }
    exit();
}

// =====================================================
// PROPERTIES ENDPOINTS
// =====================================================

if ($endpoint === 'properties' && $request_method === 'GET') {
    $stmt = $pdo->query("SELECT * FROM properties WHERE status = 'active' ORDER BY created_at DESC");
    $properties = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($properties);
    exit();
}

if ($endpoint === 'properties' && $request_method === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO properties (name, location, city, price, listing_type, property_type, rooms, area_sqft, year_built, description, images, agent_id, agent_name, agent_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $input['name'], $input['location'], $input['city'] ?? '', $input['price'],
        $input['listing_type'], $input['property_type'], $input['rooms'] ?? '',
        $input['area_sqft'] ?? null, $input['year_built'] ?? null, $input['description'] ?? '',
        $input['images'] ?? '', $input['agent_id'], $input['agent_name'], $input['agent_phone'] ?? ''
    ]);
    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    exit();
}

if (preg_match('/\/properties\/(\d+)/', $path, $matches) && $request_method === 'DELETE') {
    $id = $matches[1];
    $stmt = $pdo->prepare("UPDATE properties SET status = 'deleted' WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['success' => true]);
    exit();
}

// =====================================================
// BOOKINGS ENDPOINTS
// =====================================================

if ($endpoint === 'bookings' && $request_method === 'GET') {
    $user_id = $_GET['user_id'] ?? 0;
    $role = $_GET['role'] ?? '';
    
    if ($role === 'buyer') {
        $stmt = $pdo->prepare("SELECT * FROM bookings WHERE buyer_id = ? ORDER BY created_at DESC");
        $stmt->execute([$user_id]);
    } else {
        $stmt = $pdo->query("SELECT * FROM bookings ORDER BY created_at DESC");
    }
    $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($bookings);
    exit();
}

if ($endpoint === 'bookings' && $request_method === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO bookings (property_id, property_name, buyer_id, buyer_name, buyer_email, buyer_phone, booking_type, payment_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $input['property_id'], $input['property_name'], $input['buyer_id'], $input['buyer_name'],
        $input['buyer_email'], $input['buyer_phone'], $input['booking_type'], $input['payment_amount']
    ]);
    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    exit();
}

if (preg_match('/\/bookings\/(\d+)\/status/', $path, $matches) && $request_method === 'PUT') {
    $id = $matches[1];
    $status = $input['status'] ?? '';
    $stmt = $pdo->prepare("UPDATE bookings SET status = ? WHERE id = ?");
    $stmt->execute([$status, $id]);
    echo json_encode(['success' => true]);
    exit();
}

// =====================================================
// PAYMENTS ENDPOINTS
// =====================================================

if ($endpoint === 'payments' && $request_method === 'POST') {
    $transaction_id = 'TXN' . time() . rand(1000, 9999);
    $stmt = $pdo->prepare("INSERT INTO payments (booking_id, transaction_id, buyer_name, property_name, amount, payment_method, status) VALUES (?, ?, ?, ?, ?, ?, 'completed')");
    $stmt->execute([
        $input['booking_id'], $transaction_id, $input['buyer_name'],
        $input['property_name'], $input['amount'], $input['payment_method']
    ]);
    
    // Update booking payment status
    $stmt = $pdo->prepare("UPDATE bookings SET payment_status = 'completed', status = 'completed' WHERE id = ?");
    $stmt->execute([$input['booking_id']]);
    
    echo json_encode(['success' => true, 'transaction_id' => $transaction_id]);
    exit();
}

if ($endpoint === 'payments' && $request_method === 'GET') {
    $user_id = $_GET['user_id'] ?? 0;
    $stmt = $pdo->prepare("SELECT * FROM payments WHERE buyer_name IN (SELECT name FROM users WHERE id = ?)");
    $stmt->execute([$user_id]);
    $payments = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($payments);
    exit();
}

// =====================================================
// REFUND ENDPOINT
// =====================================================

if (preg_match('/\/bookings\/(\d+)\/refund/', $path, $matches) && $request_method === 'POST') {
    $id = $matches[1];
    $reason = $input['reason'] ?? '';
    
    $stmt = $pdo->prepare("UPDATE bookings SET status = 'refunded', refund_reason = ?, refund_date = NOW() WHERE id = ?");
    $stmt->execute([$reason, $id]);
    
    echo json_encode(['success' => true, 'message' => 'Refund processed']);
    exit();
}

// =====================================================
// REVIEWS ENDPOINTS
// =====================================================

if ($endpoint === 'reviews' && $request_method === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO reviews (property_id, user_id, user_name, rating, comment) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([
        $input['property_id'], $input['user_id'], $input['user_name'],
        $input['rating'], $input['comment']
    ]);
    echo json_encode(['success' => true]);
    exit();
}

if ($endpoint === 'reviews' && $request_method === 'GET') {
    $property_id = $_GET['property_id'] ?? 0;
    $stmt = $pdo->prepare("SELECT * FROM reviews WHERE property_id = ? ORDER BY created_at DESC");
    $stmt->execute([$property_id]);
    $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($reviews);
    exit();
}

// =====================================================
// WISHLIST ENDPOINTS
// =====================================================

if ($endpoint === 'wishlist' && $request_method === 'GET') {
    $user_id = $_GET['user_id'] ?? 0;
    $stmt = $pdo->prepare("SELECT p.* FROM properties p INNER JOIN wishlist w ON p.id = w.property_id WHERE w.user_id = ?");
    $stmt->execute([$user_id]);
    $wishlist = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($wishlist);
    exit();
}

if ($endpoint === 'wishlist' && $request_method === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO wishlist (user_id, property_id) VALUES (?, ?)");
    $stmt->execute([$input['user_id'], $input['property_id']]);
    echo json_encode(['success' => true]);
    exit();
}

if (preg_match('/\/wishlist\/(\d+)/', $path, $matches) && $request_method === 'DELETE') {
    $user_id = $_GET['user_id'] ?? 0;
    $property_id = $matches[1];
    $stmt = $pdo->prepare("DELETE FROM wishlist WHERE user_id = ? AND property_id = ?");
    $stmt->execute([$user_id, $property_id]);
    echo json_encode(['success' => true]);
    exit();
}

// =====================================================
// LOANS ENDPOINTS
// =====================================================

if ($endpoint === 'loans' && $request_method === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO loans (property_id, property_name, buyer_id, buyer_name, loan_amount, down_payment, interest_rate, loan_tenure, monthly_emi, employment_type, annual_income, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')");
    $stmt->execute([
        $input['property_id'], $input['property_name'], $input['buyer_id'], $input['buyer_name'],
        $input['loan_amount'], $input['down_payment'], $input['interest_rate'], $input['loan_tenure'],
        $input['monthly_emi'], $input['employment_type'], $input['annual_income']
    ]);
    echo json_encode(['success' => true]);
    exit();
}

if ($endpoint === 'loans' && $request_method === 'GET') {
    $user_id = $_GET['user_id'] ?? 0;
    $stmt = $pdo->prepare("SELECT * FROM loans WHERE buyer_id = ? ORDER BY created_at DESC");
    $stmt->execute([$user_id]);
    $loans = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($loans);
    exit();
}

// =====================================================
// TICKETS ENDPOINTS
// =====================================================

if ($endpoint === 'tickets' && $request_method === 'POST') {
    $stmt = $pdo->prepare("INSERT INTO support_tickets (user_id, user_name, user_email, subject, message, status) VALUES (?, ?, ?, ?, ?, 'open')");
    $stmt->execute([
        $input['user_id'], $input['user_name'], $input['user_email'],
        $input['subject'], $input['message']
    ]);
    echo json_encode(['success' => true]);
    exit();
}

if ($endpoint === 'tickets' && $request_method === 'GET') {
    $user_id = $_GET['user_id'] ?? 0;
    $role = $_GET['role'] ?? '';
    
    if ($role === 'admin') {
        $stmt = $pdo->query("SELECT * FROM support_tickets ORDER BY created_at DESC");
    } else {
        $stmt = $pdo->prepare("SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC");
        $stmt->execute([$user_id]);
    }
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($tickets);
    exit();
}

// =====================================================
// USERS MANAGEMENT (ADMIN)
// =====================================================

if ($endpoint === 'users' && $request_method === 'GET') {
    $stmt = $pdo->query("SELECT id, name, email, phone, location, role, status, created_at FROM users");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($users);
    exit();
}

if (preg_match('/\/users\/(\d+)\/status/', $path, $matches) && $request_method === 'PUT') {
    $id = $matches[1];
    $status = $input['status'] ?? '';
    $stmt = $pdo->prepare("UPDATE users SET status = ? WHERE id = ?");
    $stmt->execute([$status, $id]);
    echo json_encode(['success' => true]);
    exit();
}

if (preg_match('/\/users\/(\d+)/', $path, $matches) && $request_method === 'DELETE') {
    $id = $matches[1];
    $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND role != 'admin'");
    $stmt->execute([$id]);
    echo json_encode(['success' => true]);
    exit();
}

// =====================================================
// DASHBOARD STATS
// =====================================================

if ($endpoint === 'stats' && $request_method === 'GET') {
    $stats = [];
    $queries = [
        'total_users' => "SELECT COUNT(*) as count FROM users",
        'total_agents' => "SELECT COUNT(*) as count FROM users WHERE role = 'agent'",
        'total_buyers' => "SELECT COUNT(*) as count FROM users WHERE role = 'buyer'",
        'total_properties' => "SELECT COUNT(*) as count FROM properties WHERE status = 'active'",
        'total_bookings' => "SELECT COUNT(*) as count FROM bookings",
        'total_revenue' => "SELECT COALESCE(SUM(amount), 0) as count FROM payments WHERE status = 'completed'"
    ];
    
    foreach ($queries as $key => $query) {
        $stmt = $pdo->query($query);
        $stats[$key] = $stmt->fetch(PDO::FETCH_ASSOC)['count'];
    }
    
    echo json_encode($stats);
    exit();
}

// Default response
echo json_encode(['error' => 'Invalid endpoint']);
?>