from argon2 import PasswordHasher
ph = PasswordHasher()
h1 = ph.hash('mypassword')
print(f'Single hash ({len(h1)}): {h1[:80]}')
h2 = ph.hash(h1)
print(f'Double hash ({len(h2)}): {h2[:80]}')
