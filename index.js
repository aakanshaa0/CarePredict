// Load environment variables from .env file
require('dotenv').config();

// Import required packages
const express = require('express');   
const session = require('express-session'); 
const bcrypt = require('bcrypt');     
const { Pool } = require('pg');           
const app = express();                      
const axios = require('axios');          
const { spawn } = require('child_process'); 

// Configure Express middleware
app.set('view engine', 'ejs');  
app.use(express.static('public'));        
app.use(express.urlencoded({ extended: true })); 

// Configure session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key', 
    resave: false,                    
    saveUninitialized: false,         
    cookie: { secure: false }     
}));

// Database connection configuration
const pool = new Pool({
    user: process.env.PG_USER,           
    password: process.env.PG_PASSWORD,  
    host: process.env.PG_HOST,            
    port: process.env.PG_PORT,           
    database: process.env.PG_DATABASE     
});

// Routes
// Home Route - Display main page
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Signup Routes
// GET - Display signup form
app.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

// POST - Handle signup form submission
app.post('/signup', async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    
    // Check if passwords match
    if (password !== confirmPassword) {
        return res.render('signup', { error: 'Passwords do not match' });
    }
    
    try {
        // Hash password for security
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert new user into database
        await pool.query(
            'INSERT INTO users (email, password) VALUES ($1, $2)',
            [email, hashedPassword]
        );
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        // Handle duplicate email error
        if (err.code === '23505') {
            return res.render('signup', { error: 'Email already exists' });
        }
        res.render('signup', { error: 'Error creating account' });
    }
});

// Login Routes
// GET - Display login form
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// POST - Handle login form submission
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Find user by email
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user) {
            return res.render('login', { error: 'User not found' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.render('login', { error: 'Invalid password' });
        }

        // Set session data
        req.session.userId = user.id;
        req.session.user = user;

        res.redirect('/');
    } catch (err) {
        console.error(err);
        res.render('login', { error: 'Login failed' });
    }
});

// Logout Route - Clear session and redirect to login
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// Cardiovascular Disease Routes
// Display information page
app.get('/cardi-info', (req, res) => {
    res.render('cardi-info', { user: req.session.user });
});

// Display analysis form
app.get('/cardi-analysis', (req, res) => {
    res.render('cardi-analysis');
});

// Cancer Routes
// Display analysis form
app.get('/cancer-analysis', (req, res) => {
    res.render('cancer-analysis');
});

// Display information page
app.get('/cancer-info', (req, res) => {
    res.render('cancer-info', { user: req.session.user });
});

// Handle cardiovascular disease analysis
app.post('/analyze', (req, res) => {
    console.log("Received input:", req.body);

    // Validate input data
    if (!validateCardioInput(req.body)) {
        console.error("Validation failed for:", req.body);
        return res.status(400).send("Invalid input values");
    }

    // Process input data
    const inputData = {
        age: parseInt(req.body.age),
        gender: req.body.gender === '1' ? 2 : 1,
        height: parseInt(req.body.height),
        weight: parseFloat(req.body.weight),
        ap_hi: parseInt(req.body.ap_hi),
        ap_lo: parseInt(req.body.ap_lo),
        cholesterol: parseInt(req.body.cholesterol),
        gluc: parseInt(req.body.gluc),
        originalGender: req.body.gender
    };

    // Run Python script for prediction
    const pythonProcess = spawn('python', ['cardio_model.py']);

    // Send input data to Python script
    pythonProcess.stdin.write(JSON.stringify(inputData));
    pythonProcess.stdin.end();

    let output = '';
    let error = '';

    // Handle Python script output
    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
        console.log("Python stdout:", data.toString());
    });

    // Handle Python script errors
    pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
        console.error("Python stderr:", data.toString());
    });

    // Process Python script completion
    pythonProcess.on('close', (code) => {
        console.log(`Python process exited with code ${code}`);

        if (code !== 0 || error) {
            console.error("Full Python error:", error);
            return res.status(500).send(`Analysis failed: ${error}`);
        }

        try {
            // Process prediction result
            const prediction = parseFloat(output.trim());
            if (isNaN(prediction)) {
                throw new Error("Invalid prediction result");
            }

            console.log("Successful prediction:", prediction);
            res.render('result', {
                prediction: prediction,
                ...inputData
            });

        } catch (e) {
            console.error("Result processing error:", e);
            res.status(500).send("Result processing failed");
        }
    });
});

// Validate cardiovascular disease input data
function validateCardioInput(body) {
    const valid = (
        body.age >= 18 && body.age <= 120 &&
        ['0', '1'].includes(body.gender) &&
        body.height >= 120 && body.height <= 250 &&
        body.weight >= 30 && body.weight <= 300 &&
        body.ap_hi > 50 && body.ap_hi < 250 &&
        body.ap_lo > 30 && body.ap_lo < 200 &&
        ['1', '2', '3'].includes(body.cholesterol) &&
        ['1', '2', '3'].includes(body.gluc)
    );

    if (!valid) {
        console.error("Validation failed for:", {
            age: body.age,
            gender: body.gender,
            height: body.height,
            weight: body.weight,
            ap_hi: body.ap_hi,
            ap_lo: body.ap_lo,
            cholesterol: body.cholesterol,
            gluc: body.gluc
        });
    }
    return valid;
}

// Handle cancer analysis
app.post('/analyze-cancer', (req, res) => {
    // Process input data
    const inputData = {
        radius_mean: parseFloat(req.body.radius_mean),
        texture_mean: parseFloat(req.body.texture_mean),
        perimeter_mean: parseFloat(req.body.perimeter_mean),
        area_mean: parseFloat(req.body.area_mean),
        smoothness_mean: parseFloat(req.body.smoothness_mean),
        compactness_mean: parseFloat(req.body.compactness_mean),
        concavity_mean: parseFloat(req.body.concavity_mean),
        concave_points_mean: parseFloat(req.body.concave_points_mean),
        symmetry_mean: parseFloat(req.body.symmetry_mean),
        fractal_dimension_mean: parseFloat(req.body.fractal_dimension_mean)
    };

    // Validate input data
    if (!validateCancerInput(inputData)) {
        return res.status(400).send("Invalid input values");
    }

    // Run Python script for prediction
    const pythonProcess = spawn('python', ['cancer_model.py']);

    // Send input data to Python script
    pythonProcess.stdin.write(JSON.stringify(inputData));
    pythonProcess.stdin.end();

    let output = '';
    let error = '';

    // Handle Python script output
    pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
    });

    // Handle Python script errors
    pythonProcess.stderr.on('data', (data) => {
        error += data.toString();
    });

    // Process Python script completion
    pythonProcess.on('close', (code) => {
        if (code !== 0 || error) {
            console.error("Cancer analysis failed:", error);
            return res.status(500).render('error', {
                message: `Cancer analysis failed: ${error.substring(0, 200)}`
            });
        }
        try {
            // Process prediction result
            const prediction = parseFloat(output.trim());
            if (isNaN(prediction)) {
                throw new Error("Invalid prediction result");
            }
            res.render('cancer-result', {
                prediction: prediction,
                ...inputData
            });
        } catch (e) {
            console.error("Cancer result error:", e);
            res.status(500).render('error', {
                message: "Failed to process cancer results"
            });
        }
    });
});

// Validate cancer input data
function validateCancerInput(inputData) {
    return (
        inputData.radius_mean >= 5 && inputData.radius_mean <= 30 &&
        inputData.texture_mean >= 5 && inputData.texture_mean <= 40 &&
        inputData.perimeter_mean >= 50 && inputData.perimeter_mean <= 200 &&
        inputData.area_mean >= 300 && inputData.area_mean <= 2500 &&
        inputData.smoothness_mean >= 0.05 && inputData.smoothness_mean <= 0.25 &&
        inputData.compactness_mean >= 0.01 && inputData.compactness_mean <= 0.4 &&
        inputData.concavity_mean >= 0.0 && inputData.concavity_mean <= 0.5 &&
        inputData.concave_points_mean >= 0.0 && inputData.concave_points_mean <= 0.2 &&
        inputData.symmetry_mean >= 0.1 && inputData.symmetry_mean <= 0.3 &&
        inputData.fractal_dimension_mean >= 0.05 && inputData.fractal_dimension_mean <= 0.1
    );
}

// Find nearby hospitals using pincode
async function getHospitalsByPincode(pincode) {
    try {
        // Get coordinates from pincode
        const geocodeResponse = await axios.get(
            `https://nominatim.openstreetmap.org/search?format=json&postalcode=${pincode}&country=India`
        );
        if (geocodeResponse.data.length === 0) {
            throw new Error("Pincode not found");
        }
        const { lat, lon } = geocodeResponse.data[0];

        // Search for hospitals near coordinates
        const overpassQuery = `
            [out:json];
            node["amenity"="hospital"](around:5000, ${lat}, ${lon});
            out body;
        `;
        const overpassResponse = await axios.get(
            `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`
        );

        // Process hospital data
        const hospitals = overpassResponse.data.elements.map(hospital => ({
            name: hospital.tags.name || "Unnamed Hospital",
            address: hospital.tags["addr:full"] || "Address not available",
            mapQuery: hospital.tags.name ? hospital.tags.name.replace(/ /g, '+') : "Hospital"
        }));
        return hospitals;
    } catch (error) {
        console.error("Error fetching hospitals:", error);
        return [];
    }
}

// Handle pincode search
app.get('/pincode', async (req, res) => {
    const pincode = req.query.pincode;
    const hospitals = await getHospitalsByPincode(pincode);
    res.render('pincode', { pincode, hospitals, user: req.session.user });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on Port ${PORT}`);
});