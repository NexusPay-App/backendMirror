"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const models_1 = require("../models/models");
// MongoDB connection string from config
const MONGODB_URL = "mongodb+srv://productionbranch:JYDbTetcX1sPL4hc@cluster0.y6bk3ba.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
async function resetIndexes() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose_1.default.connect(MONGODB_URL);
        console.log('Connected to MongoDB');
        console.log('Dropping indexes for User collection...');
        await models_1.User.collection.dropIndexes();
        console.log('Indexes dropped successfully');
        // Recreate indexes with proper sparse options
        console.log('Recreating indexes...');
        await models_1.User.collection.createIndex({ phoneNumber: 1 }, { unique: true, sparse: true });
        await models_1.User.collection.createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log('Indexes recreated successfully');
        console.log('All done! You can now start the server normally.');
        process.exit(0);
    }
    catch (error) {
        console.error('Error resetting indexes:', error);
        process.exit(1);
    }
}
resetIndexes();
