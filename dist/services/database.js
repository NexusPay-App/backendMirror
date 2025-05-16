"use strict";
// import mongoose from 'mongoose';
// import config from '../config/env';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connect = connect;
// const MONGO_URL = config.MONGO_URL
// export async function connect() {
//   try {
//     await mongoose.connect(MONGO_URL);
//     console.log("Successfully connected to MongoDB using Mongoose");
//   } catch (error) {
//     console.error("Error connecting to MongoDB:", error);
//   }
// }
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = __importDefault(require("../config/env"));
const MONGO_URL = env_1.default.MONGO_URL;
// Debug: Check if the MongoDB URL is correctly loaded
console.log("MongoDB URL:", MONGO_URL);
async function connect() {
    try {
        await mongoose_1.default.connect(MONGO_URL);
        console.log("✅ Successfully connected to MongoDB");
    }
    catch (error) {
        console.error("❌ Error connecting to MongoDB:", error);
    }
}
