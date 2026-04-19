const express = require('express');
const { getSupabase } = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/movimientos
router.get('/movimientos', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('movimientos_inventario').select('*')
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reportes?mes=2024-03
router.get('/reportes', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { mes } = req.query;

    let query = supabase.from('facturas').select('*').eq('activo', true);
    if (mes) {
      query = query.gte('fecha', mes + '-01').lte('fecha', mes + '-31');
    }
    const { data, error } = await query.order('fecha');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs
router.get('/logs', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('logs').select('*')
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
