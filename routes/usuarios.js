const express = require('express');
const bcrypt = require('bcryptjs');
const { getSupabase } = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('usuarios').select('id, nombre, usuario, rol, activo, created_at').order('id');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { nombre, usuario, password, rol, activo } = req.body;

    if (!nombre || !usuario || !password) {
      return res.status(400).json({ error: 'Nombre, usuario y contraseña requeridos' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const { data, error } = await supabase.from('usuarios').insert([{
      nombre, usuario: usuario.toLowerCase().trim(),
      password: hashed, rol: rol || 'vendedor',
      activo: activo !== false
    }]).select('id, nombre, usuario, rol, activo').single();

    if (error) {
      if (error.message.includes('unique')) {
        return res.status(400).json({ error: 'Ese usuario ya existe' });
      }
      throw error;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { nombre, usuario, password, rol, activo } = req.body;
    const update = { nombre, usuario: usuario?.toLowerCase().trim(), rol, activo };
    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }
    const { data, error } = await supabase
      .from('usuarios').update(update).eq('id', req.params.id)
      .select('id, nombre, usuario, rol, activo').single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    await supabase.from('usuarios').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
