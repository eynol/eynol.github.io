---
title: 使用 traefik 去路由你的容器服务
date: 2022-03-16T20:36:08+08:00
layout: post
tags:
- Traefik
---

我把自己之前部署腾讯云上的几个服务全部将构建产物封装成了多个 docker 镜像，并且用 traefik 来做路由服务，替换了原来的 nginx。使用下来，我的感受是 traefik 真香，极大的减少了自己去新增加一个服务后，需要维护 nginx 配置的时间成本。

现在我要新增一个服务的话（例如要在群晖里跑一个 nextcloud ），可以直接用 docker 将服务运行起来，然后在 docker 镜像的 label 里声明访问到这个服务用什么域名或者用什么路径才能触达（例如定义 `nextcloud.local.com` 访问的是 nextcloud 的这个服务）。不用去配置 nginx 之类的，直接打开浏览器访问 `nextcloud.local.com` 就能访问到刚刚运行起来的 nextcloud 的容器。

本文将会介绍 traefik 的一些基本概念和配置，最终能够在本地运行一个由 traefik 路由的多个服务。

## 起因

在最开始的时候，VPS 上运行的 nodejs 程序都是用的 pm2 来管理的，程序数量占用内存过多导致 VPS 不够稳定，所以另外新开了一个 VPS，想要缓解这种不稳定。我遇到的第一个问题就是，如何将正在运行中的 nodejs 程序快速在另外一台 VPS 上部署呢？例如 自己开发的一言 PWA ，后端的实现是用的 nodejs + mongodb，如果我要迁移这个服务，就需要在另外一台 VPS 上手动安装 mongodb，并且初始化 mongodb 的配置。虽然可以写脚本来实现这种重复操作，但是这样太麻烦了。恰好了解到 docker 这项技术能够解决这个问题，如果想知道 docker 的基础用法，可以看[这个b站上的视频](https://www.bilibili.com/video/BV11L411g7U1)，我是在v站上看到的推广，觉得还不错推荐给大家。

## 使用 nginx 代理的方式

原来在 VPS 上我是怎么使用容器的呢？首先，还是用的 nginx 做 80 和 443 端口的代理程序，这样从某个域名访问到这个主机的时候，nginx 是第一个接受到请求的程序。然后 nginx 看这个域名对应的是哪一个站点配置 site.conf，然后执行代理规则。后端服务已经运行在 docker 容器里了，直接将服务端口映射到主机上的端口，例如一言 PWA 后端在 8899端口，mongodb 在 23232 端口，两个都是 docker 容器，然后通过 nginx 的负载均衡代理到这两个本地端口上（例如 proxy_pass http://127.0.0.1:8899 ）。

这种方式，我需要维护两个东西，一个是容器镜像，另一个是 nginx 代理配置文件。给域名加上了 https 后，需要维护的东西又多了域名证书，虽然是通过 cron 定时任务去更新的证书配置，但还是不方便。在这种割裂的维护方式下，有没有一种东西，能够自动帮助配置呢？

## Traefik 登场

使用 traefik 后的变化有哪些呢？

首先，运行一个 traefik 的容器，绑定主机的80端口和443端口给它，这样的话 nginx 就可以从 80 端口和 443 端口下岗了。当我从一个域名访问到这台主机的时候，第一个到的程序是 traefik，traefik 会检查这个域名在不在路由里面，在的话就会经过内置的中间件对请求进行处理，然后转发给某一个子网络的容器。例如，当我把 nextcloud 的容器运行起来以后，它有一个ip和端口号，同时还有一些用户可以配置的元信息，例如容器的标签。traefik 监听 docker 运行环境的变化，它知道某个容器上线了，然后对 nextcloud 容器标签进行解析，解析出配置的规则是 当访问 nextcloud.local.com 的时候，就把http请求转发到这个容器暴露的端口上来。

这种方式，我只需要维护 traefik 容器和自己的镜像，再也不用去上线一个服务就去新增一个 nginx 配置文件了。而且，traefik 可以配置好 DNS 服务商的的个人授权 token 以后，就能自动申请 https 证书，再也不用关心 https 证书过期的问题。

接下来，我将介绍 traefik 的一些概念，帮助你也学会怎么使用它。

### traefik 二进制程序

traefik 的文档官网在[https://doc.traefik.io/traefik/](https://doc.traefik.io/traefik/)

traefik 既可以作为二进制程序安装到主机上，也可以用 docker 容器的方式运行。traefik 的配置文件，分为两类，一类是软件启动时必须的静态配置（static configuration），一类是描述如何将请求转发到服务节点的动态配置（dynamic configuration）。静态配置文件一般是固定的不会经常变更的启动配置，动态配置就好比于可以热重载的配置内容，一般指的是路由规则和中间件或者负载均衡等配置信息。

我们在软件启动的配置文件 traefik.yml 里面需要申明这些内容：

- traefik 软件自身监听在哪些端口，称为 `entrypoint`。所有的请求都会从 entrypoint 进入 traefik 的处理流程。
- traefik 读取动态配置的来源，称为 `provider`。traefik 会读取动态配置（dynamic configuration），自动生成代理规则，例如你可以用文件作为一个 provider，每次都更新这个文件，这样就实现了动态配置；也可以指定为一个固定的 url，traefik 会每隔一段时间就请求一次这个动态配置。这里，我们配置申明了 provider 的方式，并不会在这里马上就消费 provider 提供的 dynamic configuration。traefik 可以支持 k8s, docker, docker swarm, etcd, zookeeper, Consul 等。


我将选择 docker 作为动态配置的 provider， 示例的 traefik.yml 配置文件如下。

```yaml
entryPoints:
  diy-name:
    # diy-name 可以自己指定，只要保证在 docker 文件中使用对应的这个名称
    address: ":80"

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
```

然后，为了方便，我将使用 docker-compose 将 traefik 服务跑起来，并且可以通过本地的 80 端口访问到。

```yaml
version: '3'

services:
  nginx:
    image: nginx:alpine
    labels:
      # 下面的 routers 后面的是 nginx 是router 的名字，不能和其他 router名称重复。可以随便改
      - "traefik.http.routers.nginx.entrypoints=diy-name" # 注意这里使用的和静态配置里面相同的名称
      - "traefik.http.routers.nginx.rule=Host(`localhost`) && PathPrefix(`/nginx`)"
  

  whoami:
    image: traefik/whoami
    labels:
      - "traefik.http.routers.whoami.entrypoints=diy-name" # 注意这里使用的和静态配置里面相同的名称
      - "traefik.http.routers.whoami.rule=Host(`localhost`) && PathPrefix(`/whoami`)"

  traefik:
    image: traefik:latest
    ports:
      - 80:80  # 前面的80是本机的，后面的80是容器里面的80
      - 443:443
      - 8080:8080
    environment:
      - TZ=Asia/Shanghai
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml
```


在 docker-compose 所在的目录执行 docker-compose up ,然后分别访问 localhost/whoami, localhost/nginx，你会发现请求这两个地址分别访问到了不同的 docker 容器。

![use traefik](/img/use-traefik-demo-whoami.png)

![use nginx](/img/use-traefik-demo-nginx.png)

从以上两个图片可以看出，traefik 可以自动将请求转发到不同的容器里面，并且可以自动获取到容器的配置信息。
![infrastructure](/img/use-traefik-demo-map-1.svg)

### traefik 的官方示例图

我们来看一下 traefik 官方文档中的示意图，用户的请求从 entrypoint 进入，然后通过 router 的规则，将请求转发到不同的服务。我们的 whoami 和 nginx 两个容器在这里被看作是两个不同的服务（service）。注意看图片中的框选范围，service 是在 traefik 的生态内的，这里的 service 指的是申明和注册的服务（ service 对应的服务器也可能已经挂了），最后有个小尾巴才是真正将请求到真实的服务器上去。 
![tranfik entrypoint](https://doc.traefik.io/traefik/assets/img/entrypoints.png)



什么是 router ？就是路由匹配规则，它可以指定一个规则，当请求匹配到这个规则的时候，就会转发到对应的 service 上去。我们可以暂时理解为是 nginx 的 server_name 和 location 的组合。
例如我们上面 demo 里面指定的 两个服务都是在 localhost 这个域名下面，路由前缀不同，所以 traefik 能够将我们的请求转发到不同的容器上去的。
![traefik router](https://doc.traefik.io/traefik/assets/img/routers.png)


traefik 中的服务的命名规则是，"服务名称 + @ + provider"。以上面的 docker-compose 文件示例，traefik 会自动生成两个服务：`whoami@docker` 和 `nginx@docker`，我们不需要手动在 traefik 中注册，这一切都是自动的，我们运行的容器就类比于下面的 server1 和 server2。有注意到 docker-compose 里面的 labels 吗？我们只定义了 entrypoint 和 router 就可以了。是不是很简单？
![traefik service](https://doc.traefik.io/traefik/assets/img/services.png)

但是我们注意到，请求 `localhost/nginx` 的时候，尽管访问到的是 nginx 服务，但页面显示的是404的错误页。我们可以使用 traefik 里的中间件（middleware）来解决这个 404 的问题。中间件是什么呢？中间件可以在请求发送到 server 前经过一些简单的处理。
![traefik middleware](https://doc.traefik.io/traefik/assets/img/middleware/overview.png)

我们来分析 404 的原因，可以观察一下 docker-compose up 以后输出的 nginx 的访问日志。因为请求的是 `localhost/nginx` 然后根据 router 的规则，这个请求会被转发到 nginx，请求的 pathname 还是原封不动的 `/nginx` ( 这一点可以观察一下 `localhost/whoami` 展示的内容)。而 nginx 默认只会服务 `/` 这个路径，找不到  `/nginx` ，所以报错404了。那么我们要找一个中间件来把路径上的 `/nginx` 去掉。

```yml
version: '3'

services:
  nginx:
    image: nginx:alpine
    labels:
      - "traefik.http.routers.nginx.entrypoints=diy-name" # 注意这里使用的和静态配置里面相同的名称
      - "traefik.http.routers.nginx.rule=Host(`localhost`) && PathPrefix(`/nginx`)"
      # 告诉 router 会经过下面的这些名字的中间件
      - "traefik.http.routers.nginx.middlewares=remove-nginx"
      # 添加下面这行，就可以去掉请求中的 nginx 路径。同样的，middlewares 后面的也是这个中间件的名称
      - "traefik.http.middlewares.remove-nginx.stripprefix.prefixes=/nginx,/fiibar" 
```

traefik 有很多的中间件，可以在官方文档的 中间件 这一章节里面找到你需要的中间件。

有了以上的一些基础概念，你已经会使用 traefik 了。如果你开始对 traefik 开始感兴趣了，建议现在去看一下官方文档开始学习。下文我将会列举一些 traefik 可能会用到的配置的内容。


## 如何使用 traefik 来给域名配置 https 证书

查看官方文档的说明，traefik 可以使用 acme.sh 自动的更新域名的 https 证书的。第一步，需要在程序启动的静态配置文件 `traefik.yml` 里面声明用哪一个域名解析服务商的服务来认证域名信息。

```yml
# ...
certificatesResolvers:
  dnspod:
    acme:
      email: xxxx@mail.com
      # 这里是存储的acme的数据，建议放在一个持久化的目录下面，防止容器停止导致数据丢失
      storage: /etc/traefik/acme.json 
      # 这里是说用 dns 记录认证的方式来确认这个域名是我有所有权的
      dnsChallenge:
        provider: dnspod
```

第二步,将 dns 服务提供商的 token 通过环境变量传递给 traefik 程序，由于我的 traefik 运行在 docker 里，所以我通过 docker 的环境变量配置就可以传递过去。
```yml
version: '3'

services:
  traefik:
    image: traefik:latest
    networks:
      - traefik-net
    # 让traefik 可以通过 host.docker.internal 访问宿主机的资源
    extra_hosts:
      - "host.docker.internal:host-gateway" 
    ports:
      - 80:80
      - 443:443
    environment:
      - TZ=Asia/Shanghai
      # 注意，这里的 DNSPOD 提供了 userid 和 token,用逗号隔开 设置为 DNSPOD_API_KEY 才可以
      - "DNSPOD_API_KEY=userid,token"
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # map data dir, so that it can hot-reload dynamic.yml
      - ./data:/etc/traefik

```

第三步，让那些需要 HTTPS 服务的 router 规则开启 tls 和 resolver。 需要注意的是，我们需要在 443 的端口的这个 entrypoint 上开启（如果不这么写的话，必须在路由器地址栏里写完整端口号）。

```yml
## Dynamic configuration
labels:
  - traefik.http.routers.blog.rule=Host(`example.com`) && Path(`/blog`)
  - traefik.http.routers.blog.tls=true # 必须开启这个TLS
  - traefik.http.routers.blog.tls.certresolver=dnspod # 这里是 resolver 的名称，
```

上面的默认规则是去读区 rule 中的 "Host()" 规则来获得当前使用的证书的域名的。还有另外的配置方式，就是可以声明使用泛域名证书。

```yml
## Dynamic configuration
labels:
  - traefik.http.routers.blog.rule=Host(`example.com`) && Path(`/blog`)
  - traefik.http.routers.blog.tls=true
  - traefik.http.routers.blog.tls.certresolver=myresolver
  # 下面两行是新增的，会申请下来一个证书，里面包含 example.org 和 *.example.org.
  - traefik.http.routers.blog.tls.domains[0].main=example.org
  - traefik.http.routers.blog.tls.domains[0].sans=*.example.org

```

还可以申请二级泛域名证书的哦～ 例如 
```yml
## Dynamic configuration
labels:
  - traefik.http.routers.blog.rule=Host(`example.com`) && Path(`/blog`)
  - traefik.http.routers.blog.tls=true
  - traefik.http.routers.blog.tls.certresolver=myresolver
  # 下面两行是新增的，会申请下来一个证书，里面包含 homelab.example.org 和 *.homelable.example.org.
  - traefik.http.routers.blog.tls.domains[0].main=homelab.example.org
  - traefik.http.routers.blog.tls.domains[0].sans=*.homelab.example.org
```

我们可以给自己的域名弄一个 homelab.example.org 的，然后在家庭内网里面使用二级泛域名去访问内网的服务。例如：

- nextcloud.homelab.example.org
- pi-hole.homelab.example.org

有了这些域名，但是如果这些域名没有指向内网的服务器怎么办？可以通过在内部自建 DNS 服务解决，将自己设备的 DNS 解析改为自建的即可。这里可以使用软路由来做这件事情，这样的话不用修改自己手持设备上的 DNS 服务器。另一个推荐的是使用简单的 pi-hole 软件来作为dns 服务。


## 如何让 docker 容器内的 traefik 访问宿主机上的端口和服务呢？

通过给容器设置 extra_hosts， 这样就能访问到了。Windows 和 mac os 上默认会将容器内请求 `host.docker.internal` 这个 host 的流量都打到宿主机上。例如，我在电脑上的8080端口运行一个服务，traefik 运行在 docker 容器里，在 traefik 容器内请求 `host.docker.internal:8080` 的时候，请求会转发到电脑上的 8080 端口上。
```yml
services:
  traefik:
    image: traefik:latest
    networks:
      - traefik-net
    # 让traefik 可以通过 host.docker.internal 访问宿主机的资源
    extra_hosts:
      - "host.docker.internal:host-gateway" 
```

这个有什么用呢？ 当你的群晖上已经有一些原生的服务在运行的时候，又需要从 docker 容器里访问到这些宿主机上运行的服务的时候很有用。

## 如何使用 traefik 来实现开发环境 预发环境和生产环境呢？

第一个问题是，为什么要区分这些环境呢？主要的原因是希望运行中的服务不要被破坏，这样可以保证环境的安全。
我们的一份代码会跑在三个不同的环境里面。

为了更好的迁移应用，建议按照 [12 factor app](https://12factor.net/zh_cn/) 中的方法论将应用做成可配置式的，这样可以更好的管理应用的迁移。

其实用 traefik 来实现这些开发环境 生产环境都是很方便的，最简单的就是分配不同的 Host 即可，还有一种是通过 query 携带的参数的 通过 router 转发到不同的服务去。

## 如何实现开发环境的 docker-compose 文件和生产环境的 docker-compose 文件分离

docker-compose 支持 -f 参数，指定文件名称，还可以支持多个配置文件聚合，具体可以去看 docker-compose 官方文档。

```bash
# 第一种方式是，这种是通过文件名称区分环境，这种方式比较简单，两份文件有重复的部分
docker-compose -f docker-compose.production.yml up
docker-compose -f docker-compose.development.yml up

# 第二种方式是通过传入更多的 yml 文件， docker-compose 会自动合并文件的配置以后，再运行
# 这种方式，后面的 -f 文件会覆盖前面的配置，后面的文件可以只写一部分配置
# 有些配置是使用的覆盖，有的是追加，注意看官方文档
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```


## 总结

traefik 可以简化我们去单独配置不同服务的过程，使用订阅者观察者模式自动生成配置信息。router 和中间件的机制都是 nginx 机制可以实现的，某拍云的 一篇技术文章中，也是自己实现了一套对应的观察者模式的程序，在后端服务上线下线的时候，自动从模版中生成一份新的 nginx 配置文件，然后调用 nginx -s reload 的命令，来实现自动化的服务上线和下线的过程。

