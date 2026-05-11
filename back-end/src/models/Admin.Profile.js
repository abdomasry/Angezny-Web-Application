const mongoose = require("mongoose");

const adminProfileSchema = new mongoose.Schema({
userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
},
rank: {
    type: String,
    enum: ['superadmin', 'admin'],
},
role: {
    type: String,
    enum: ['support', 'technical', 'manager'],
},
powers: {
    type: mongoose.Schema.Types.ObjectId,
    ref : 'Powers',
},
tickets: [{
    type: mongoose.Schema.Types.ObjectId,
    ref : 'Ticket',
}]
},{ timestamps: true });

module.exports = mongoose.model("AdminProfile", adminProfileSchema);