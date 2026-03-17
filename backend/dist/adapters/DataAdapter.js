"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataAdapter = void 0;
const events_1 = __importDefault(require("events"));
class DataAdapter extends events_1.default {
    constructor(sourceName) {
        super();
        this.sourceName = sourceName;
    }
}
exports.DataAdapter = DataAdapter;
