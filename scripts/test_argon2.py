from argon2 import PasswordHasher
ph = PasswordHasher()
h = ph.hash('test1234')
print('Hash:', h[:80])
print('Verify old:', ph.verify(h, 'test1234'))
try:
    ph.verify(h, 'wrong')
    print('Verify wrong: True (BUG!)')
except Exception as e:
    print('Verify wrong: caught -', type(e).__name__)
