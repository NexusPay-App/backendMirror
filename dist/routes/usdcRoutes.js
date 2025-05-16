"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const usdcController_1 = require("../controllers/usdcController");
const router = express_1.default.Router();
router.get('/usdc-balance/:chain/:address', usdcController_1.getUsdcBalance);
router.get('/conversionrate', usdcController_1.conversionController);
exports.default = router;
