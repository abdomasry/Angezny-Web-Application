const mongoose = require("mongoose");

const powersSchema = new mongoose.Schema({ 
    create: {type: Boolean, default: false},
    read: {type: Boolean, default: false},
    edit: {type: Boolean, default: false},
    delete: {type: Boolean, default: false},
},{ timestamps: true });

module.exports = mongoose.model("Powers", powersSchema);