# where repo work will happen
FROM ubuntu:20.04 as initial
ARG NPM_BASE_64_AUTH
ARG NPM_EMAIL
ARG SNOOTY_PARSER_VERSION=0.15.2
ARG SNOOTY_FRONTEND_VERSION=0.15.7
ARG MUT_VERSION=0.10.7
ARG REDOC_CLI_VERSION=1.2.3
ARG NPM_EMAIL
ARG WORK_DIRECTORY=/home/docsworker-xlarge

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR ${WORK_DIRECTORY}

# helper libraries for docs builds
RUN apt-get update && apt-get install -y vim git unzip zip rsync

# get node 18
# https://gist.github.com/RinatMullayanov/89687a102e696b1d4cab
RUN apt-get install --yes curl
RUN curl --location https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get install --yes nodejs
RUN apt-get install --yes build-essential
RUN echo //artifactory.corp.mongodb.com/artifactory/api/npm/:_auth=${NPM_BASE_64_AUTH} >> ~/.npmrc
# install snooty parser
RUN curl -L -o snooty-parser.zip https://github.com/mongodb/snooty-parser/releases/download/v${SNOOTY_PARSER_VERSION}/snooty-v${SNOOTY_PARSER_VERSION}-linux_x86_64.zip \
    && unzip -d /opt/ snooty-parser.zip

# install mut
RUN curl -L -o mut.zip https://github.com/mongodb/mut/releases/download/v${MUT_VERSION}/mut-v${MUT_VERSION}-linux_x86_64.zip \
    && unzip -d /opt/ mut.zip


ENV PATH="${PATH}:/opt/snooty:/opt/mut:/${WORK_DIRECTORY}/.local/bin"

# setup user and root directory
RUN useradd -ms /bin/bash docsworker-xlarge
RUN chmod 755 -R ${WORK_DIRECTORY}
RUN chown -Rv docsworker-xlarge ${WORK_DIRECTORY}
USER docsworker-xlarge

# install snooty frontend and docs-tools
RUN git clone -b v${SNOOTY_FRONTEND_VERSION} --depth 1 https://github.com/mongodb/snooty.git       \
    && cd snooty                                                                                   \
    && npm ci --legacy-peer-deps --omit=dev                                                        

RUN curl https://raw.githubusercontent.com/mongodb/docs-worker-pool/meta/makefiles/shared.mk -o shared.mk


RUN git clone -b @dop/redoc-cli@${REDOC_CLI_VERSION} --depth 1 https://github.com/mongodb-forks/redoc.git redoc \
    # Install dependencies for Redoc CLI
    && cd redoc/ \
    && npm ci --prefix cli/ --omit=dev

FROM initial as persistence

RUN mkdir -p modules/persistence && chmod 755 modules/persistence
COPY modules/persistence/package*.json ./modules/persistence/
RUN cd ./modules/persistence \
    && npm ci --legacy-peer-deps 
# Build persistence module

COPY --chown=docsworker-xlarge modules/persistence/tsconfig*.json ./modules/persistence
COPY --chown=docsworker-xlarge modules/persistence/src ./modules/persistence/src/
COPY --chown=docsworker-xlarge modules/persistence/index.ts ./modules/persistence

RUN cd ./modules/persistence \
    && npm run build:esbuild

FROM initial as oas

RUN  mkdir -p modules/oas-page-builder && chmod 755 modules/oas-page-builder
COPY modules/oas-page-builder/package*.json ./modules/oas-page-builder/
RUN cd ./modules/oas-page-builder \
    && npm ci --legacy-peer-deps 
# Build modules
# OAS Page Builder
COPY --chown=docsworker-xlarge modules/oas-page-builder/tsconfig*.json ./modules/oas-page-builder
COPY --chown=docsworker-xlarge modules/oas-page-builder/src ./modules/oas-page-builder/src/
COPY --chown=docsworker-xlarge modules/oas-page-builder/index.ts ./modules/oas-page-builder

RUN cd ./modules/oas-page-builder \
    && npm run build:esbuild

FROM initial as root

COPY --from=persistence --chown=docsworker-xlarge ${WORK_DIRECTORY}/modules/persistence/dist/ ./modules/persistence
COPY --from=oas --chown=docsworker-xlarge ${WORK_DIRECTORY}/modules/oas-page-builder/dist/ ./modules/oas-page-builder

# Root project build
COPY package*.json ./
RUN npm ci --legacy-peer-deps


COPY tsconfig*.json ./
COPY config config/
COPY api api/
COPY src src/

RUN npm run build:esbuild

ENV PERSISTENCE_MODULE_PATH=${WORK_DIRECTORY}/modules/persistence/index.js
ENV OAS_MODULE_PATH=${WORK_DIRECTORY}/modules/oas-page-builder/index.js
ENV REDOC_PATH=${WORK_DIRECTORY}/redoc/cli/index.js

RUN mkdir -p modules/persistence && chmod 755 modules/persistence
RUN mkdir repos && chmod 755 repos

EXPOSE 3000
CMD ["node", "app.js"]
