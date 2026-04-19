const express = require('express');
const { getSupabase } = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/productos - all products (authenticated)
router.get('/', verifyToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/productos/publicos - public catalog (no auth)
router.get('/publicos', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('productos')
      .select('id, nombre, cat, precio, stock, descripcion, media, pub')
      .eq('pub', true)
      .gt('stock', 0)
      .order('cat');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/productos - create (admin only)
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const prod = { ...req.body, stock: 0, costo: 0, activo: true };
    const { data, error } = await supabase.from('productos').insert([prod]).select().single();
    if (error) throw error;
    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'crear_producto',
      tabla: 'productos', referencia_id: data.id,
      detalle: 'Producto: ' + prod.nombre
    }]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/productos/:id - update (admin only)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;
    const { data, error } = await supabase.from('productos').update(req.body).eq('id', id).select().single();
    if (error) throw error;
    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'editar_producto',
      tabla: 'productos', referencia_id: +id,
      detalle: 'Producto actualizado'
    }]);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/productos/:id - soft delete (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;
    await supabase.from('productos').update({ activo: false }).eq('id', id);
    await supabase.from('logs').insert([{
      usuario: req.user.nombre, accion: 'desactivar_producto',
      tabla: 'productos', referencia_id: +id, detalle: 'Producto desactivado'
    }]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
