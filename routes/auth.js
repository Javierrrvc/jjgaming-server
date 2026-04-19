const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getSupabase } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    if (!usuario || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('usuario', usuario.toLowerCase().trim())
      .eq('activo', true)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Check password - support both bcrypt and plain text (migration period)
    let validPassword = false;
    if (user.password.startsWith('$2')) {
      // bcrypt hash
      validPassword = await bcrypt.compare(password, user.password);
    } else {
      // plain text (legacy) - accept and upgrade to bcrypt
      validPassword = user.password === password;
      if (validPassword) {
        const hashed = await bcrypt.hash(password, 10);
        await supabase.from('usuarios').update({ password: hashed }).eq('id', user.id);
      }
    }

    if (!validPassword) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      user: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /api/auth/verify
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(401).json({ valid: false });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ valid: false });
  }
});

module.exports = router;
