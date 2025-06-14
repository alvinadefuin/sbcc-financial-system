// seedJanuary2023.js
// Script to populate SBCC Financial Database with January 2023 actual data

const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "database", "church_financial.db");

// January 2023 Collections Data (₱72,267 total)
const collectionsData = [
  {
    date: '2023-01-08',
    particular: 'Tithes & Offerings',
    control_number: '2023-122',
    payment_method: 'Cash',
    total_amount: 9755.00,
    tithes_offerings: 9755.00,
    pbcm_share: 975.50,
    operating_funds: 7804.00,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-08',
    particular: 'Special Offerings',
    control_number: '2023-121',
    payment_method: 'Cash',
    total_amount: 437.00,
    tithes_offerings: 437.00,
    pbcm_share: 0,
    operating_funds: 437.00,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-15',
    particular: 'Tithes & Offerings',
    control_number: '2023-01B',
    payment_method: 'Cash',
    total_amount: 40887.00,
    tithes_offerings: 40887.00,
    pbcm_share: 4088.70,
    operating_funds: 32709.60,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-15',
    particular: 'Special Offerings',
    control_number: '2023-01A',
    payment_method: 'Cash',
    total_amount: 305.00,
    tithes_offerings: 305.00,
    pbcm_share: 0,
    operating_funds: 305.00,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-22',
    particular: 'Tithes & Offerings',
    control_number: '2023-03',
    payment_method: 'Cash',
    total_amount: 10090.00,
    tithes_offerings: 10090.00,
    pbcm_share: 1009.00,
    operating_funds: 8072.00,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-22',
    particular: 'Special Offerings',
    control_number: '2023-02',
    payment_method: 'Cash',
    total_amount: 220.00,
    tithes_offerings: 220.00,
    pbcm_share: 0,
    operating_funds: 220.00,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-29',
    particular: 'Tithes & Offerings',
    control_number: '2023-05',
    payment_method: 'Cash',
    total_amount: 10342.00,
    tithes_offerings: 10342.00,
    pbcm_share: 1034.20,
    operating_funds: 8273.60,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-29',
    particular: 'Special Offerings',
    control_number: '2023-04',
    payment_method: 'Cash',
    total_amount: 231.00,
    tithes_offerings: 231.00,
    pbcm_share: 0,
    operating_funds: 231.00,
    mission_funds: 0,
    special_funds: 0,
    created_by: 'system'
  }
];

// January 2023 Expenses Data (₱17,436.50 total)
const expensesData = [
  {
    date: '2023-01-15',
    particular: 'Love gift for Marife (Jan. 1-15, 2023)',
    forms_number: '2022-67',
    cheque_number: '7626478',
    total_amount: 3600.00,
    workers_share: 3600.00,
    fellowship_expense: 0,
    supplies: 0,
    utilities: 0,
    building_maintenance: 0,
    benevolence_donations: 0,
    honorarium: 0,
    vehicle_maintenance: 0,
    gasoline_transport: 0,
    pbcm_share: 0,
    mission_evangelism: 0,
    admin_expense: 0,
    worship_music: 0,
    discipleship: 0,
    pastoral_care: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-30',
    particular: 'Love gift for Marife (Jan. 16-31, 2023)',
    forms_number: '2022-68',
    cheque_number: '7626479',
    total_amount: 3600.00,
    workers_share: 3600.00,
    fellowship_expense: 0,
    supplies: 0,
    utilities: 0,
    building_maintenance: 0,
    benevolence_donations: 0,
    honorarium: 0,
    vehicle_maintenance: 0,
    gasoline_transport: 0,
    pbcm_share: 0,
    mission_evangelism: 0,
    admin_expense: 0,
    worship_music: 0,
    discipleship: 0,
    pastoral_care: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-31',
    particular: 'Road mapping to PBCC & Ministry Expenses',
    forms_number: '2022-70',
    cheque_number: '7626480',
    total_amount: 3890.00,
    workers_share: 0,
    fellowship_expense: 2295.50, // Road mapping + food + Christmas fellowship
    supplies: 252.50, // bottled water + batteries
    utilities: 341.00, // Water bill
    building_maintenance: 0,
    benevolence_donations: 0,
    honorarium: 0,
    vehicle_maintenance: 0,
    gasoline_transport: 660.00, // Gasoline portion
    pbcm_share: 0,
    mission_evangelism: 0,
    admin_expense: 0,
    worship_music: 341.50, // Music team snacks
    discipleship: 0,
    pastoral_care: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-31',
    particular: 'Love gift for speaker Elder Homer',
    forms_number: '2022-71',
    cheque_number: '7626481',
    total_amount: 3000.00,
    workers_share: 0,
    fellowship_expense: 0,
    supplies: 0,
    utilities: 0,
    building_maintenance: 0,
    benevolence_donations: 0,
    honorarium: 3000.00, // Speaker honorarium
    vehicle_maintenance: 0,
    gasoline_transport: 0,
    pbcm_share: 0,
    mission_evangelism: 0,
    admin_expense: 0,
    worship_music: 0,
    discipleship: 0,
    pastoral_care: 0,
    created_by: 'system'
  },
  {
    date: '2023-01-31',
    particular: 'Food for speakers & Building maintenance',
    forms_number: '2022-72',
    cheque_number: '7626482',
    total_amount: 3346.50,
    workers_share: 0,
    fellowship_expense: 3070.50, // Food for speakers
    supplies: 0,
    utilities: 0,
    building_maintenance: 120.00, // Bidet & spray for CR
    benevolence_donations: 0,
    honorarium: 0,
    vehicle_maintenance: 0,
    gasoline_transport: 0,
    pbcm_share: 0,
    mission_evangelism: 0,
    admin_expense: 0,
    worship_music: 156.00, // Music team snacks
    discipleship: 0,
    pastoral_care: 0,
    created_by: 'system'
  }
];

function seedDatabase() {
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error("Error opening database:", err.message);
      return;
    }
    console.log("Connected to SQLite database for seeding.");
  });

  // Clear existing test data (optional - remove if you want to keep existing data)
  db.run("DELETE FROM collections WHERE created_by = 'system'", (err) => {
    if (err) {
      console.error("Error clearing collections:", err.message);
    } else {
      console.log("Cleared existing system collections data.");
    }
  });

  db.run("DELETE FROM expenses WHERE created_by = 'system'", (err) => {
    if (err) {
      console.error("Error clearing expenses:", err.message);
    } else {
      console.log("Cleared existing system expenses data.");
    }
  });

  // Insert Collections Data
  const insertCollection = db.prepare(`
    INSERT INTO collections (
      date, particular, control_number, payment_method, total_amount,
      tithes_offerings, pbcm_share, operating_funds, mission_funds, special_funds,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  console.log("\n🔄 Inserting January 2023 Collections Data...");
  collectionsData.forEach((collection, index) => {
    insertCollection.run([
      collection.date,
      collection.particular,
      collection.control_number,
      collection.payment_method,
      collection.total_amount,
      collection.tithes_offerings,
      collection.pbcm_share,
      collection.operating_funds,
      collection.mission_funds,
      collection.special_funds,
      collection.created_by
    ], (err) => {
      if (err) {
        console.error(`Error inserting collection ${index + 1}:`, err.message);
      } else {
        console.log(`✅ Inserted: ${collection.particular} - ₱${collection.total_amount.toLocaleString()}`);
      }
    });
  });

  insertCollection.finalize();

  // Insert Expenses Data
  const insertExpense = db.prepare(`
    INSERT INTO expenses (
      date, particular, forms_number, cheque_number, total_amount,
      workers_share, fellowship_expense, supplies, utilities, building_maintenance,
      benevolence_donations, honorarium, vehicle_maintenance, gasoline_transport,
      pbcm_share, mission_evangelism, admin_expense, worship_music, discipleship, pastoral_care,
      created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  console.log("\n🔄 Inserting January 2023 Expenses Data...");
  expensesData.forEach((expense, index) => {
    insertExpense.run([
      expense.date,
      expense.particular,
      expense.forms_number,
      expense.cheque_number,
      expense.total_amount,
      expense.workers_share,
      expense.fellowship_expense,
      expense.supplies,
      expense.utilities,
      expense.building_maintenance,
      expense.benevolence_donations,
      expense.honorarium,
      expense.vehicle_maintenance,
      expense.gasoline_transport,
      expense.pbcm_share,
      expense.mission_evangelism,
      expense.admin_expense,
      expense.worship_music,
      expense.discipleship,
      expense.pastoral_care,
      expense.created_by
    ], (err) => {
      if (err) {
        console.error(`Error inserting expense ${index + 1}:`, err.message);
      } else {
        console.log(`✅ Inserted: ${expense.particular} - ₱${expense.total_amount.toLocaleString()}`);
      }
    });
  });

  insertExpense.finalize();

  // Calculate and display summary
  setTimeout(() => {
    console.log("\n" + "=".repeat(60));
    console.log("📊 JANUARY 2023 SBCC FINANCIAL SUMMARY");
    console.log("=".repeat(60));
    
    const totalCollections = collectionsData.reduce((sum, item) => sum + item.total_amount, 0);
    const totalExpenses = expensesData.reduce((sum, item) => sum + item.total_amount, 0);
    const netBalance = totalCollections - totalExpenses;
    
    console.log(`💰 Total Collections: ₱${totalCollections.toLocaleString()}`);
    console.log(`💸 Total Expenses:    ₱${totalExpenses.toLocaleString()}`);
    console.log(`📈 Net Balance:       ₱${netBalance.toLocaleString()}`);
    console.log(`📅 Period: January 1-31, 2023`);
    console.log(`📝 Collections Records: ${collectionsData.length}`);
    console.log(`📝 Expense Records: ${expensesData.length}`);
    
    console.log("\n✅ Database seeding completed successfully!");
    console.log("🚀 Your SBCC Financial Dashboard now has real January 2023 data!");
    console.log("\n📋 Next Steps:");
    console.log("   1. Refresh your dashboard to see the data");
    console.log("   2. Test the financial reports");
    console.log("   3. Add charts and visualizations");
    
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed.");
      }
    });
  }, 2000);
}

// Run the seeder
if (require.main === module) {
  console.log("🌱 Starting SBCC Database Seeding...");
  console.log("Adding January 2023 actual financial data from church records\n");
  seedDatabase();
}

module.exports = { seedDatabase, collectionsData, expensesData };