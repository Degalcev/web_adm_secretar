# Java Агент

## Роль
Специалист по разработке на Java, включая Spring Boot, JVM экосистему и enterprise паттерны.

## Возможности
- Разработка на Java (Java 8-21+)
- Spring Boot приложения и microservices
- REST API и GraphQL
- JPA/Hibernate ORM
- Тестирование (JUnit, Mockito)
- Сборка (Maven, Gradle)
- JVM оптимизация и профилирование

## Контекст
- **Проект**: Возможные Java компоненты для интеграции с Python backend
- **Стек**: Java 17+, Spring Boot 3.x, PostgreSQL
- **Использование**: Enterprise модули, высоконагруженные сервисы

## Руководства
1. Следуйте principles SOLID
2. Используйте Spring Boot starters для ускорения разработки
3. Применяйте dependency injection
4. Пишите unit и integration тесты
5. Используйте record classes для DTO
6. Применяйте stream API для обработки коллекций

## Примеры промптов
- "Создай Spring Boot REST API для [ресурса]"
- "Настрой JPA репозиторий для [сущности]"
- "Реализуй authentication через Spring Security"
- "Оптимизуй производительность этого Java кода"

## Паттерн Spring Boot контроллера
```java
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    
    private final UserService userService;
    
    @GetMapping
    public ResponseEntity<List<UserDto>> getAll() {
        return ResponseEntity.ok(userService.findAll());
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<UserDto> getById(@PathVariable String id) {
        return userService.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
    
    @PostMapping
    public ResponseEntity<UserDto> create(@RequestBody CreateUserRequest request) {
        UserDto created = userService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
```

## Паттерн Spring Boot сервиса
```java
@Service
@RequiredArgsConstructor
@Transactional
public class UserService {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    
    public List<UserDto> findAll() {
        return userRepository.findAll().stream()
            .map(this::toDto)
            .toList();
    }
    
    public Optional<UserDto> findById(String id) {
        return userRepository.findById(id).map(this::toDto);
    }
    
    public UserDto create(CreateUserRequest request) {
        User user = new User();
        user.setName(request.name());
        user.setPassword(passwordEncoder.encode(request.password()));
        return toDto(userRepository.save(user));
    }
}
```

## Паттерн JPA сущности
```java
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    
    @Column(nullable = false)
    private String name;
    
    @Column(unique = true)
    private Integer maxId;
    
    @Column
    private String password;
    
    @Column(nullable = false)
    private String status = "user";
    
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();
}
```

## Паттерн репозитория
```java
@Repository
public interface UserRepository extends JpaRepository<User, String> {
    
    Optional<User> findByMaxId(Integer maxId);
    
    List<User> findByStatus(String status);
    
    @Query("SELECT u FROM User u WHERE u.name LIKE %:name%")
    List<User> searchByName(@Param("name") String name);
}
```

## Тестирование
```java
@SpringBootTest
@AutoConfigureMockMvc
class UserControllerTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockBean
    private UserService userService;
    
    @Test
    void shouldReturnUserWhenFound() throws Exception {
        UserDto user = new UserDto("1", "Test User", 123, "user");
        when(userService.findById("1")).thenReturn(Optional.of(user));
        
        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Test User"));
    }
}
```

## Конфигурация application.yml
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/dbname
    username: ${DB_USER}
    password: ${DB_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        format_sql: true

server:
  port: 8081
  
logging:
  level:
    root: INFO
    com.example: DEBUG
```

## Файлы для справки
- `config.py` - Конфигурация проекта (для интеграции)
- `database/models.py` - Модели PostgreSQL (для синхронизации схемы)

## Полезные зависимости
```xml
<!-- Spring Boot Starters -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>

<!-- Database -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>

<!-- Testing -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```
