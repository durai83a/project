const http = require('http');
const socketIo = require('socket.io');
const express = require('express');
const ExcelJS = require('exceljs');
const { Pool } = require('pg'); // Import Pool from pg library for PostgreSQL
const fs = require('fs');
const path = require('path');
const ModbusRTU = require('modbus-serial');

const app = express();
const port = 3000;
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// PostgreSQL setup (Update with your DB details)
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  database: 'Temperature',
  password: 'root',
  port: 5432,
  max: 10, // connection pool size
});

// Test PostgreSQL connection
(async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL');
    client.release(); // Release connection back to the pool
  } catch (err) {
    console.error('Error connecting to PostgreSQL:', err);
  }
})();

// Serve the main HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index3.html'));
});

// Temperature chart API
app.get('/temperature-data', async (req, res) => {
  const { start, end, hopper1, hopper2 } = req.query;

  if (!hopper1 && !hopper2) {
    res.status(400).send('No sensors selected');
    return;
  }

  let selectClauses = [];
  if (hopper1 === 'true') {
    selectClauses.push("timestamp, sensor1_temperature AS sensor1_temperature");
  }
  if (hopper2 === 'true') {
    selectClauses.push("timestamp, sensor2_temperature AS sensor2_temperature");
  }

  if (selectClauses.length === 0) {
    res.status(400).send('No valid hoppers selected');
    return;
  }

  const query = `
      SELECT ${selectClauses.join(', ')}
      FROM temperature_data
      WHERE timestamp BETWEEN $1 AND $2
  `;

  try {
    const { rows } = await pool.query(query, [start, end]); // Use rows for PostgreSQL query result
    console.log('Temperature Data Results:', rows); // Log the results
    res.json(rows);
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).send('Server error');
  }
});

// Alarm count API
app.get('/alarm-data', async (req, res) => {
  const { start, end, hopper1, hopper2 } = req.query;

  if (!hopper1 && !hopper2) {
    res.status(400).send('No sensors selected');
    return;
  }

  let selectClauses = [];
  if (hopper1 === 'true') {
    selectClauses.push("AVG(CASE WHEN sensor1_temperature > 30 THEN 1 ELSE 0 END) AS sensor1_alarm_count");
  }
  if (hopper2 === 'true') {
    selectClauses.push("AVG(CASE WHEN sensor2_temperature > 26 THEN 1 ELSE 0 END) AS sensor2_alarm_count");
  }

  if (selectClauses.length === 0) {
    res.status(400).send('No valid hoppers selected');
    return;
  }

  const query = `
    SELECT EXTRACT(YEAR FROM timestamp) AS year, EXTRACT(MONTH FROM timestamp) AS month,
        ${selectClauses.join(', ')}
    FROM temperature_data
    WHERE timestamp BETWEEN $1 AND $2
    GROUP BY year, month
  `;

  try {
    const { rows } = await pool.query(query, [start, end]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).send('Server error');
  }
});
// Function for inserting temperature data into PostgreSQL
async function insertTemperatureData(timestamp, sensor1_temperature, sensor2_temperature, humidity) {
  try {
    const query = `
      INSERT INTO temperature_data (timestamp, sensor1_temperature, sensor2_temperature, humidity)
      VALUES ($1, $2, $3, $4)
    `;
    await pool.query(query, [timestamp, sensor1_temperature, sensor2_temperature, humidity]);
    console.log('Data inserted successfully:', { timestamp, sensor1_temperature, sensor2_temperature, humidity });
  } catch (err) {
    console.error('Error inserting data:', err);
  }
}


// API endpoint to fetch average counts
app.post('/api/temperature-data', (req, res) => {
  const { start, end, shifts } = req.body;

  const query = `
      SELECT 
          AVG(CASE WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 0 AND 7 AND (sensor1_temperature > 20 OR sensor2_temperature > 20) THEN 1 ELSE 0 END) AS shift_a_avg,
          AVG(CASE WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 8 AND 15 AND (sensor1_temperature > 20 OR sensor2_temperature > 20) THEN 1 ELSE 0 END) AS shift_b_avg,
          AVG(CASE WHEN EXTRACT(HOUR FROM timestamp) BETWEEN 16 AND 23 AND (sensor1_temperature > 20 OR sensor2_temperature > 20) THEN 1 ELSE 0 END) AS shift_c_avg
      FROM temperature_data
      WHERE DATE(timestamp) BETWEEN $1 AND $2
  `;

  pool.query(query, [start, end], (err, result) => {
      if (err) {
          return res.status(500).json({ error: err.message });
      }

      const [resultRow] = result.rows;

      // Only return selected shifts in the response
      res.json({
          shift_a_avg: shifts.includes('a') ? resultRow.shift_a_avg : null,
          shift_b_avg: shifts.includes('b') ? resultRow.shift_b_avg : null,
          shift_c_avg: shifts.includes('c') ? resultRow.shift_c_avg : null
      });
  });
});

// The rest of the code remains unchanged
// Existing Modbus RTU connection and data insertion logic (unchanged)
// ...
// Start the server
// Existing Modbus RTU connection and data insertion logic (unchanged)
const TEMP_REGISTER = 1;  // Temperature register address for sensor 1
const TEMP_REGISTER1 = 2; // Temperature register address for sensor 2
const HUM_REGISTER = 3;   // Humidity register address for sensor 2
const DEVICE_1_ID = 1;    // Modbus ID of the first device
const DEVICE_2_ID = 2;    // Modbus ID of the second device

const client = new ModbusRTU();
client.connectRTUBuffered('COM12', { baudRate: 9600 })
  .then(() => {
    console.log('Modbus client connected');
    readAndStoreData();
  })
  .catch(err => {
    console.error('Error connecting to Modbus device:', err);
  });

let sensor1_temperature = 0;
let sensor2_temperature = 0;
let humidity = 0;

function generateRandomHopperData() {
  return {
    //hopper3_temperature: (Math.random() * 30 + 20).toFixed(2),
    hopper4_temperature: (Math.random() * 30 + 20).toFixed(2),
    hopper5_temperature: (Math.random() * 30 + 20).toFixed(2),
    hopper6_temperature: (Math.random() * 30 + 20).toFixed(2),
    hopper3_humidity: (Math.random() * 30 + 50).toFixed(2),
    hopper4_humidity: (Math.random() * 30 + 50).toFixed(2),
    hopper5_humidity: (Math.random() * 30 + 50).toFixed(2),
    hopper6_humidity: (Math.random() * 30 + 50).toFixed(2),
  };
}

/*async function insertTemperatureData(timestamp, sensor1_temperature, sensor2_temperature, humidity) {
  try {
    const query = `
      INSERT INTO temperature_data (timestamp, sensor1_temperature, sensor2_temperature, humidity)
      VALUES (?, ?, ?, ?)
    `;
    await pool.query(query, [timestamp, sensor1_temperature, sensor2_temperature, humidity]);
    console.log('Data inserted successfully:', { timestamp, sensor1_temperature, sensor2_temperature, humidity });
  } catch (err) {
    console.error('Error inserting data:', err);
  }
}
*/


async function readAndStoreData() {
  console.log('Starting to read Modbus data every 5 seconds...');

  setInterval(async () => {
    try {
      const timestamp = new Date();

      client.setID(DEVICE_1_ID);
      const tempData = await client.readHoldingRegisters(TEMP_REGISTER, 1);
      sensor1_temperature = tempData.data[0] / 100.0;
      console.log('Sensor 1 Temperature:', sensor1_temperature);
      client.setID(DEVICE_2_ID);
      const tempData1 = await client.readHoldingRegisters(TEMP_REGISTER1, 2);
      sensor2_temperature = tempData1.data[0] / 10.0;
      const humData = await client.readHoldingRegisters(HUM_REGISTER, 3);
      humidity = humData.data[0] / 10.0;

      const randomHopperData = generateRandomHopperData();
      await insertTemperatureData(timestamp, sensor1_temperature, sensor2_temperature, humidity);

      io.emit('modbusData', {
        sensor1_temperature,
        sensor2_temperature,
        humidity,
        ...randomHopperData,
      });

      console.log('Data sent to frontend:', {
        sensor1_temperature,
        sensor2_temperature,
        humidity,
        ...randomHopperData
      });

    } catch (error) {
      if (error.errno === 'ETIMEDOUT') {
        console.log('No response from the instrument');
      } else {
        console.log(`An error occurred: ${error.message}`);
      }
    }
  }, 5000);  // Read and emit data every 5 seconds
}

setInterval(() => {
  const modbusData = {
    hopper1_temperature: sensor1_temperature,
    hopper2_temperature: sensor2_temperature,
    hopper3_temperature: humidity,
    hopper4_temperature: (Math.random() * 30 + 20).toFixed(2),
    hopper5_temperature: (Math.random() * 30 + 20).toFixed(2),
    hopper6_temperature: (Math.random() * 30 + 20).toFixed(2),
  };
  io.emit('modbusData', modbusData);
}, 1000);



server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
