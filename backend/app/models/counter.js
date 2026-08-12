import mongoose from "mongoose";

/**
 * Generic atomic sequence counter (e.g. for legally-sequential invoice numbers).
 * Use Counter.next(key) to atomically increment and read the next value.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.statics.next = async function nextSequence(key, { session = null } = {}) {
  const query = this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );
  if (session) query.session(session);
  const doc = await query;
  return doc.seq;
};

export default mongoose.model("Counter", counterSchema);
